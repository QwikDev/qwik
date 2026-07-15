import { isDev } from '@qwik.dev/core/build';
import {
  _res,
  createQRL,
  createSerializationContext,
  createSsrRootRef,
  disposeOwner,
  getActiveInvokeContextOrNull,
  getPlatform,
  invoke,
  isSsrRecordChunk,
  newInvokeContext,
  setPlatform,
  SsrOutputWriter,
  type SerializationContext,
  type ServerDataContext,
  type SsrEventAttrChunk,
  type SsrOutput,
  type SsrReferenceChunk,
  type UseOnMap,
  version,
  withLocale,
} from '@qwik.dev/core';
import {
  QContainerValue,
  QBaseAttr,
  QContainerAttr,
  QInstanceAttr,
  QLocaleAttr,
  QManifestHashAttr,
  QRenderAttr,
  QRuntimeAttr,
  QVersionAttr,
  escapeHTML,
  type ValueOrPromise,
} from './qwik-copy';
import { createSsrEventAttr, createSsrEventAttrParts } from './ssr-event-attr';
import { SsrScriptEmitter } from './ssr-script-emitter';
import { applyUseOnToSsrOutput } from './ssr-use-on';
import { SsrScheduler, type SsrLane } from './ssr-scheduler';
import { SsrDomRef, setSsrRef } from './ssr-ref';
import { serializeSsrEvent } from './ssr-events';
import { StringWriter } from './string-writer';
import type {
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToStringOptions,
  RenderToStringResult,
  RenderToString,
  RenderToStream,
} from './types';
import type { ResolvedManifest } from './types';
import { getBuildBase } from './utils';
import { createPlatform, getSymbolHash } from './platform';
import { resolveManifest } from './manifest';

export interface SsrRenderContext extends ServerDataContext {
  serializationCtx: SerializationContext;
  scheduler: SsrLane;
  nextId(): number;
  setRef(value: unknown, nodeId: number): void;
  addRoot(value: unknown): number;
  contextScopeRef(): SsrReferenceChunk;
  eventAttr(name: string, value: unknown, hasMovedCaptures?: boolean): SsrEventAttrChunk;
  styleIds: Map<string, string>;
}

/** @internal */
export type SsrRenderRoot<Props = undefined> = (
  props: Props,
  ctx: SsrRenderContext
) => ValueOrPromise<SsrOutput>;

/** @internal */
export const renderToStringCompiled = async <Props = undefined>(
  root: SsrRenderRoot<Props>,
  opts: RenderToStringOptions<Props> = {}
): Promise<RenderToStringResult> => {
  const stream = new StringWriter();
  const result = await renderToStreamCompiled(root, { ...opts, stream });

  return {
    html: stream.toString(),
    isStatic: result.isStatic,
    manifest: result.manifest,
    snapshotResult: result.snapshotResult,
    timing: result.timing,
  };
};

export const renderToStreamCompiled = async <Props = undefined>(
  root: SsrRenderRoot<Props>,
  opts: RenderToStreamOptions<Props>
): Promise<RenderToStreamResult> => {
  const previousPlatform = getPlatform();
  const resolvedManifest = resolveManifest(opts.manifest);
  setPlatform(createPlatform(opts, resolvedManifest));
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
      SsrDomRef,
      (symbol) => {
        const hash = getSymbolHash(symbol);
        const chunk = resolvedManifest?.mapper[hash];
        return chunk ? chunk[1] : '';
      },
      () => {},
      new WeakMap<any, any>()
    );
    const scripts = new SsrScriptEmitter({
      debug: opts.debug,
      nonce: opts.serverData?.nonce,
      qwikLoader: opts.qwikLoader,
    });
    const styleIds = new Map<string, string>();
    const scheduler = new SsrScheduler();
    const rootLane = scheduler.createLane(serializationCtx);
    let nextId = 0;
    const ctx: SsrRenderContext & {
      finalizeComponentOutput(output: SsrOutput, events: UseOnMap): SsrOutput;
    } = {
      serializationCtx,
      scheduler: rootLane,
      styleIds,
      serverData: opts.serverData,
      nextId() {
        return nextId++;
      },
      setRef(value, nodeId) {
        setSsrRef(value, nodeId, serializationCtx);
      },
      addRoot(value) {
        return serializationCtx.$addRoot$(value);
      },
      contextScopeRef() {
        const scope = getActiveInvokeContextOrNull()?.localContextScope ?? null;
        if (isDev && scope === null) {
          throw new Error('Missing context scope for context provider.');
        }
        return createSsrRootRef(serializationCtx.$addRoot$(scope!));
      },
      eventAttr(name, value, hasMovedCaptures = false) {
        return createSsrEventAttr(serializationCtx, name, value, hasMovedCaptures || locale !== '');
      },
      finalizeComponentOutput(output, events) {
        return applyUseOnToSsrOutput(output, events, ctx.eventAttr);
      },
    };
    rootInvokeContext.container = ctx as any;

    let output = await (locale
      ? withLocale(locale, () => invoke(rootInvokeContext, root, opts.props as Props, ctx))
      : invoke(rootInvokeContext, root, opts.props as Props, ctx));
    await rootLane.flush();
    if (rootInvokeContext.useOnEvents !== undefined) {
      output = applyUseOnToSsrOutput(output, rootInvokeContext.useOnEvents, ctx.eventAttr);
    }
    if (containerTagName === 'html') {
      output = relocateHeadlessCarriers(output);
    }
    const stateAttrParts = createStateScriptEventAttrs(serializationCtx);
    const styledOutput = injectStyles(output, styleIds);
    const [containerOpen, containerClose] = createContainerTags(
      containerTagName,
      containerAttributes,
      styledOutput
    );
    const finalOutput: SsrOutput[] = [containerOpen, styledOutput];
    if (serializationCtx.$roots$.length > 0) {
      await serializationCtx.$serialize$();
      finalOutput.push(
        scripts.emitState(
          serializationCtx.$writer$.toString(),
          0,
          serializationCtx.$serializedRootCount$,
          stateAttrParts
        )
      );
    }
    if (serializationCtx.$eventQrls$.size > 0) {
      finalOutput.push(scripts.emitQwikLoader());
      finalOutput.push(scripts.emitQwikEvents(serializationCtx.$eventNames$));
    }
    finalOutput.push(containerClose);
    let size = 0;
    const writer = new SsrOutputWriter({
      write(chunk) {
        size += chunk.length;
        return opts.stream.write(chunk);
      },
    });
    await writer.finish(finalOutput);

    return {
      flushes: 0,
      size,
      isStatic: serializationCtx.$roots$.length === 0 && serializationCtx.$eventQrls$.size === 0,
      manifest: resolvedManifest?.manifest,
      snapshotResult: {
        funcs: serializationCtx.$syncFns$,
        qrls: Array.from(serializationCtx.$eventQrls$),
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

/** @public */
export const renderToString = renderToStringCompiled as RenderToString;
/** @public */
export const renderToStream = renderToStreamCompiled as RenderToStream;

function createStateScriptEventAttrs(
  serializationCtx: ReturnType<typeof createSerializationContext>
): readonly (string | SsrReferenceChunk)[] | undefined {
  const eagerResume = serializationCtx.$eagerResume$;
  if (eagerResume.size === 0) {
    return undefined;
  }
  const serialized = serializeSsrEvent(
    serializationCtx,
    'q-d:qidle',
    createQRL(null, '_res', _res, null, [...eagerResume]),
    false
  );
  return serialized === null ? undefined : createSsrEventAttrParts('q-d:qidle', serialized);
}

function createContainerAttributes(
  opts: RenderToStreamOptions<any>,
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
  output: SsrOutput
): [string, string] {
  const openTag = createContainerOpenTag(tagName, attrs);
  if (tagName !== 'html' || hasDocumentSections(output)) {
    return [openTag, `</${tagName}>`];
  }
  return [openTag + '<head></head><body>', '</body></html>'];
}

function relocateHeadlessCarriers(output: SsrOutput): SsrOutput {
  const carriers: SsrOutput[] = [];
  let withoutCarriers: SsrOutput;
  if (isHeadlessCarrierOutput(output)) {
    carriers.push(output);
    withoutCarriers = [];
  } else {
    withoutCarriers = removeHeadlessCarriers(output, carriers);
  }
  if (carriers.length === 0) {
    return output;
  }
  const withHead = insertAfterElement(withoutCarriers, 'head', carriers);
  if (withHead !== null) {
    return withHead;
  }
  return hasElement(withoutCarriers, 'body')
    ? ['<head>', carriers, '</head>', withoutCarriers]
    : ['<head>', carriers, '</head><body>', withoutCarriers, '</body>'];
}

function isHeadlessCarrierOutput(output: SsrOutput): output is readonly SsrOutput[] {
  return (
    Array.isArray(output) &&
    output.length === 2 &&
    isSsrRecordChunk(output[0]) &&
    output[0].headlessCarrier === true
  );
}

function removeHeadlessCarriers(output: SsrOutput, carriers: SsrOutput[]): SsrOutput {
  if (!Array.isArray(output)) {
    return output;
  }
  let children: SsrOutput[] | null = null;
  for (let i = 0; i < output.length; i++) {
    const child = output[i];
    if (isHeadlessCarrierOutput(child)) {
      children ??= output.slice(0, i);
      carriers.push(child);
    } else {
      const nested = removeHeadlessCarriers(child, carriers);
      if (nested !== child) {
        children ??= output.slice(0, i);
      }
      children?.push(nested);
    }
  }
  return children ?? output;
}

function insertAfterElement(
  output: SsrOutput,
  tag: string,
  inserted: readonly SsrOutput[]
): SsrOutput | null {
  if (!Array.isArray(output)) {
    return null;
  }
  for (let i = 0; i < output.length; i++) {
    const child = output[i];
    if (isSsrRecordChunk(child) && child.element === tag) {
      return [...output.slice(0, i + 1), ...inserted, ...output.slice(i + 1)];
    }
    const nested = insertAfterElement(child, tag, inserted);
    if (nested !== null) {
      const children = output.slice();
      children[i] = nested;
      return children;
    }
  }
  return null;
}

function hasElement(output: SsrOutput, tag: string): boolean {
  if (Array.isArray(output)) {
    return output.some((child) => hasElement(child, tag));
  }
  return isSsrRecordChunk(output) && output.element === tag;
}

function injectStyles(output: SsrOutput, styles: Map<string, string>): SsrOutput {
  if (styles.size === 0) {
    return output;
  }
  const styleHtml = Array.from(styles, ([styleId, content]) => {
    return `<style q:style="${escapeHTML(styleId)}">${content}</style>`;
  }).join('');
  const withHeadStyles = replaceFirstOutputString(output, /<\/head>/i, `${styleHtml}</head>`);
  if (withHeadStyles !== undefined) {
    return withHeadStyles;
  }
  if (hasOutputPattern(output, /<body(\s|>|\/)/i)) {
    return [`<head>${styleHtml}</head>`, output];
  }
  return [`<head>${styleHtml}</head><body>`, output, '</body>'];
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

function hasDocumentSections(output: SsrOutput): boolean {
  return hasOutputPattern(output, /<(head|body)(\s|>|\/)/i);
}

function hasOutputPattern(output: SsrOutput, pattern: RegExp): boolean {
  if (typeof output === 'string') {
    return pattern.test(output);
  }
  if (Array.isArray(output)) {
    for (let i = 0; i < output.length; i++) {
      if (hasOutputPattern(output[i], pattern)) {
        return true;
      }
    }
    return false;
  }
  if (isSsrRecordChunk(output)) {
    for (let i = 0; i < output.parts.length; i++) {
      const part = output.parts[i];
      if (typeof part === 'string' && pattern.test(part)) {
        return true;
      }
    }
  }
  return false;
}

function replaceFirstOutputString(
  output: SsrOutput,
  pattern: RegExp,
  replacement: string
): SsrOutput | undefined {
  if (typeof output === 'string') {
    return pattern.test(output) ? output.replace(pattern, replacement) : undefined;
  }
  if (Array.isArray(output)) {
    for (let i = 0; i < output.length; i++) {
      const child = replaceFirstOutputString(output[i], pattern, replacement);
      if (child !== undefined) {
        const children = output.slice();
        children[i] = child;
        return children;
      }
    }
    return undefined;
  }
  if (isSsrRecordChunk(output)) {
    for (let i = 0; i < output.parts.length; i++) {
      const part = output.parts[i];
      if (typeof part === 'string' && pattern.test(part)) {
        const parts = output.parts.slice();
        parts[i] = part.replace(pattern, replacement);
        return { ...output, parts };
      }
    }
  }
  return undefined;
}

function getLocale(opts: RenderToStringOptions<any>): string {
  if (typeof opts.locale === 'function') {
    return opts.locale(opts);
  }
  return opts.serverData?.locale || opts.locale || opts.containerAttributes?.locale || '';
}

function randomStr() {
  return (Math.random().toString(36) + '000000').slice(2, 8);
}
