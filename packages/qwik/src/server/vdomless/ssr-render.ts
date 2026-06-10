import { StringSSRWriter } from '../ssr-stream-writer';
import { setEvent } from '../../core/ssr/ssr-events';
import { createSerializationContext } from '../../core/shared/serdes/serialization-context';
import { escapeHTML } from '../../core/shared/utils/character-escaping';
import type { SSRWriteChunk } from '../../core/ssr/ssr-types';
import { SsrScriptEmitter } from './ssr-script-emitter';
import type {
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToStringOptions,
  RenderToStringResult,
} from '../types';

export interface SsrRenderContext {
  nextId(): number;
  addRoot(value: unknown): number;
  eventAttr(name: string, value: unknown, hasMovedCaptures?: boolean): string;
}

export type SsrRenderRoot = (_props: undefined, ctx: SsrRenderContext) => string;

export const renderToString = async (
  root: SsrRenderRoot,
  opts: RenderToStringOptions = {}
): Promise<RenderToStringResult> => {
  const stream = new StringSSRWriter();
  const result = await renderToStream(root, { ...opts, stream });

  return {
    html: stream.toString(),
    isStatic: result.isStatic,
    manifest: result.manifest,
    snapshotResult: result.snapshotResult,
    timing: result.timing,
  };
};

export const renderToStream = async (
  root: SsrRenderRoot,
  opts: RenderToStreamOptions
): Promise<RenderToStreamResult> => {
  const serializationCtx = createSerializationContext(
    null,
    null,
    () => '',
    () => {},
    new WeakMap<any, any>()
  );
  const scripts = new SsrScriptEmitter(opts);
  let nextId = 0;
  const ctx: SsrRenderContext = {
    nextId() {
      return nextId++;
    },
    addRoot(value) {
      return serializationCtx.$addRoot$(value);
    },
    eventAttr(name, value, hasMovedCaptures = false) {
      const serialized = setEvent(serializationCtx, name, value, hasMovedCaptures);
      return serialized === null ? '' : ` ${name}="${escapeHTML(writeChunks(serialized))}"`;
    },
  };

  const html = root(undefined, ctx);
  await opts.stream.write(html);
  if (serializationCtx.$roots$.length > 0) {
    await serializationCtx.$serialize$();
    await scripts.emitState(
      serializationCtx.$writer$.toString(),
      0,
      serializationCtx.$serializedRootCount$
    );
  }
  if (serializationCtx.$eventQrls$.size > 0) {
    await scripts.emitQwikLoader();
    await scripts.emitQwikEvents(serializationCtx.$eventNames$);
  }

  return {
    flushes: 0,
    size: html.length,
    isStatic: serializationCtx.$roots$.length === 0 && serializationCtx.$eventQrls$.size === 0,
    manifest: undefined,
    snapshotResult: {
      funcs: serializationCtx.$syncFns$,
      qrls: Array.from(serializationCtx.$eventQrls$),
      resources: [],
      mode:
        serializationCtx.$roots$.length > 0
          ? 'render'
          : serializationCtx.$eventQrls$.size > 0
            ? 'listeners'
            : 'static',
    },
    timing: {
      firstFlush: 0,
      render: 0,
      snapshot: 0,
    },
  };
};

function writeChunks(value: string | SSRWriteChunk[]): string {
  return typeof value === 'string' ? value : value.map(writeChunk).join('');
}

function writeChunk(chunk: SSRWriteChunk): string {
  if (typeof chunk === 'string' || typeof chunk === 'number') {
    return String(chunk);
  }
  return chunk.path.join(' ');
}
