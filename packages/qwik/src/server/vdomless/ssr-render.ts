import { isDev } from '@qwik.dev/core/build';
import { StringSSRWriter } from '../ssr-stream-writer';
import { setEvent } from '../../core/ssr/ssr-events';
import { getClientManifest } from '../../core/shared/get-client-manifest';
import { getPlatform, setPlatform } from '../../core/shared/platform/platform';
import { createQRL } from '../../core/shared/qrl/qrl-class';
import { _res } from '../../core/shared/jsx/bind-handlers';
import { withLocale } from '../../core/vdomless/runtime/use-locale';
import { createSerializationContext } from '../../core/shared/serdes/serialization-context';
import type { SerializationContext } from '../../core/shared/serdes/serialization-context';
import { escapeHTML } from '../../core/shared/utils/character-escaping';
import type { ValueOrPromise } from '../../core/shared/utils/types';
import { QContainerValue } from '../../core/shared/types';
import {
  QBaseAttr,
  QContainerAttr,
  QInstanceAttr,
  QLocaleAttr,
  QManifestHashAttr,
  QRenderAttr,
  QRuntimeAttr,
  QVersionAttr,
} from '../../core/shared/utils/markers';
import type { SSRWriteChunk } from '../../core/ssr/ssr-types';
import {
  getActiveInvokeContextOrNull,
  invoke,
  newInvokeContext,
} from '../../core/vdomless/runtime/invoke-context';
import { disposeOwner } from '../../core/vdomless/runtime/owner';
import { version } from '../../core/version';
import { SsrScriptEmitter } from './ssr-script-emitter';
import type {
  QwikManifest,
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToStringOptions,
  RenderToStringResult,
} from '../types';
import type { CorePlatformServer, ResolvedManifest, SymbolMapper } from '../qwik-types';
import { getBuildBase } from '../utils';

export interface SsrRenderContext {
  serializationCtx: SerializationContext;
  nextId(): number;
  addRoot(value: unknown): number;
  contextScopeId(): string;
  eventAttr(name: string, value: unknown, hasMovedCaptures?: boolean): string;
}

export type SsrRenderRoot = (_props: undefined, ctx: SsrRenderContext) => ValueOrPromise<string>;

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
  const previousPlatform = getPlatform();
  const resolvedManifest = resolveManifest(opts.manifest);
  setVdomlessServerPlatform(opts, resolvedManifest);
  const rootInvokeContext = newInvokeContext();

  try {
    const containerTagName = opts.containerTagName ?? 'html';
    const buildBase = getBuildBase(opts);
    const locale = getLocale(opts);
    const instanceHash = randomStr();
    const containerAttributes = createContainerAttributes(
      opts,
      resolvedManifest,
      buildBase,
      locale,
      instanceHash
    );
    const serializationCtx = createSerializationContext(
      null,
      null,
      (symbol) => {
        const hash = getSymbolHash(symbol);
        const chunk = resolvedManifest?.mapper[hash];
        return chunk ? chunk[1] : '';
      },
      () => {},
      new WeakMap<any, any>()
    );
    const scripts = new SsrScriptEmitter(opts);
    let nextId = 0;
    const ctx: SsrRenderContext = {
      serializationCtx,
      nextId() {
        return nextId++;
      },
      addRoot(value) {
        return serializationCtx.$addRoot$(value);
      },
      contextScopeId() {
        const scope = getActiveInvokeContextOrNull()?.localContextScope ?? null;
        if (scope === null) {
          throw new Error('Missing context scope for context provider.');
        }
        if (scope.id === null) {
          scope.id = String(serializationCtx.$addRoot$(scope));
        }
        return scope.id;
      },
      eventAttr(name, value, hasMovedCaptures = false) {
        const serialized = setEvent(
          serializationCtx,
          name,
          value,
          hasMovedCaptures || locale !== ''
        );
        return serialized === null ? '' : ` ${name}="${escapeHTML(writeChunks(serialized))}"`;
      },
    };
    rootInvokeContext.container = ctx as any;

    const html = await (locale
      ? withLocale(locale, () => invoke(rootInvokeContext, root, undefined, ctx))
      : invoke(rootInvokeContext, root, undefined, ctx));
    const stateAttrs = createStateScriptEventAttrs(serializationCtx);
    const [containerOpen, containerClose] = createContainerTags(
      containerTagName,
      containerAttributes,
      html
    );
    await opts.stream.write(containerOpen);
    await opts.stream.write(html);
    if (serializationCtx.$roots$.length > 0) {
      await serializationCtx.$serialize$();
      await scripts.emitState(
        serializationCtx.$writer$.toString(),
        0,
        serializationCtx.$serializedRootCount$,
        stateAttrs
      );
    }
    if (serializationCtx.$eventQrls$.size > 0) {
      await scripts.emitQwikLoader();
      await scripts.emitQwikEvents(serializationCtx.$eventNames$);
    }
    await opts.stream.write(containerClose);

    return {
      flushes: 0,
      size: containerOpen.length + html.length + containerClose.length,
      isStatic: serializationCtx.$roots$.length === 0 && serializationCtx.$eventQrls$.size === 0,
      manifest: resolvedManifest?.manifest,
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
  } finally {
    if (rootInvokeContext.owner !== null) {
      disposeOwner(rootInvokeContext.owner);
    }
    setPlatform(previousPlatform);
  }
};

function createStateScriptEventAttrs(
  serializationCtx: ReturnType<typeof createSerializationContext>
): Record<string, string> | undefined {
  const eagerResume = serializationCtx.$eagerResume$;
  if (eagerResume.size === 0) {
    return undefined;
  }
  const serialized = setEvent(
    serializationCtx,
    'q-d:qidle',
    createQRL(null, '_res', _res, null, [...eagerResume]),
    false
  );
  return serialized === null ? undefined : { 'q-d:qidle': writeChunks(serialized) };
}

function createContainerAttributes(
  opts: RenderToStreamOptions,
  resolvedManifest: ResolvedManifest | undefined,
  buildBase: string,
  locale: string,
  instanceHash: string
): Record<string, string> {
  const containerAttributes = { ...(opts.containerAttributes ?? {}) };
  const qRender = containerAttributes[QRenderAttr];
  containerAttributes[QContainerAttr] = QContainerValue.PAUSED;
  containerAttributes[QRuntimeAttr] = '2';
  containerAttributes[QVersionAttr] = version ?? 'dev';
  containerAttributes[QRenderAttr] = (qRender ? qRender + '-' : '') + (isDev ? 'ssr-dev' : 'ssr');
  containerAttributes[QBaseAttr] = buildBase;
  containerAttributes[QLocaleAttr] = locale;
  containerAttributes[QManifestHashAttr] = resolvedManifest?.manifest.manifestHash ?? '';
  containerAttributes[QInstanceAttr] = instanceHash;
  opts.serverData ||= {};
  opts.serverData.containerAttributes = containerAttributes;
  return containerAttributes;
}

function createContainerTags(
  tagName: string,
  attrs: Record<string, string>,
  html: string
): [string, string] {
  const openTag = createContainerOpenTag(tagName, attrs);
  if (tagName !== 'html' || hasDocumentSections(html)) {
    return [openTag, `</${tagName}>`];
  }
  return [openTag + '<head></head><body>', '</body></html>'];
}

function createContainerOpenTag(tagName: string, attrs: Record<string, string>): string {
  let html = tagName === 'html' ? '<!DOCTYPE html>' : '';
  html += `<${tagName}`;
  for (const name in attrs) {
    const value = attrs[name];
    if (value === undefined) {
      continue;
    }
    html += ` ${name}="${escapeHTML(value)}"`;
  }
  return html + '>';
}

function hasDocumentSections(html: string): boolean {
  return /<(head|body)(\s|>|\/)/i.test(html);
}

function getLocale(opts: RenderToStringOptions): string {
  if (typeof opts.locale === 'function') {
    return opts.locale(opts);
  }
  return opts.serverData?.locale || opts.locale || opts.containerAttributes?.locale || '';
}

function resolveManifest(
  manifest?: Partial<QwikManifest | ResolvedManifest> | undefined
): ResolvedManifest | undefined {
  const builtManifest = getOptionalClientManifest();
  const mergedManifest = (manifest ? { ...builtManifest, ...manifest } : builtManifest) as
    | ResolvedManifest
    | QwikManifest;

  if (!mergedManifest || 'mapper' in mergedManifest) {
    return mergedManifest;
  }
  if (mergedManifest.mapping) {
    const mapper: SymbolMapper = {};
    for (const symbol in mergedManifest.mapping) {
      const bundleFilename = mergedManifest.mapping[symbol];
      mapper[getSymbolHash(symbol)] = [symbol, bundleFilename];
    }
    return {
      mapper,
      manifest: mergedManifest,
      injections: mergedManifest.injections || [],
    };
  }
  return undefined;
}

function getOptionalClientManifest() {
  try {
    return getClientManifest();
  } catch {
    return undefined;
  }
}

function setVdomlessServerPlatform(
  opts: RenderToStreamOptions,
  resolvedManifest: ResolvedManifest | undefined
): void {
  const mapper = resolvedManifest?.mapper;
  const serverPlatform: CorePlatformServer = {
    isServer: true,
    async importSymbol(_containerEl, _url, symbolName) {
      const hash = getSymbolHash(symbolName);
      const registeredSymbol = (globalThis as any).__qwik_reg_symbols?.get(hash);
      if (registeredSymbol) {
        return registeredSymbol;
      }
      throw new Error(`Dynamic import ${symbolName} not found`);
    },
    raf: () => Promise.resolve(),
    chunkForSymbol(symbolName, chunk, parent) {
      const mapped = opts.symbolMapper
        ? opts.symbolMapper(symbolName, mapper, parent)
        : mapper?.[getSymbolHash(symbolName)];
      if (mapped) {
        return mapped;
      }
      return chunk ? [symbolName, chunk] : undefined;
    },
  };
  setPlatform(serverPlatform);
}

function getSymbolHash(symbolName: string) {
  const index = symbolName.lastIndexOf('_');
  return index > -1 ? symbolName.slice(index + 1) : symbolName;
}

function randomStr() {
  return (Math.random().toString(36) + '000000').slice(2, 8);
}

function writeChunks(value: string | SSRWriteChunk[]): string {
  return typeof value === 'string' ? value : value.map(writeChunk).join('');
}

function writeChunk(chunk: SSRWriteChunk): string {
  if (typeof chunk === 'string' || typeof chunk === 'number') {
    return String(chunk);
  }
  return chunk.path.join(' ');
}
