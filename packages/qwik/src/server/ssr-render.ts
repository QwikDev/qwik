import { isDev } from '@qwik.dev/core/build';
import {
  _res,
  createQRL,
  createSerializationContext,
  createSsrNodeId,
  createSsrRecord,
  createSsrRootRef,
  disposeOwner,
  disposeSubscriber,
  getActiveInvokeContextOrNull,
  getPlatform,
  invoke,
  isPromise,
  isSsrRecordChunk,
  maybeThen,
  newInvokeContext,
  Owner,
  renderSsrContent,
  setPlatform,
  SsrOutputWriter,
  type QRL,
  type SerializationContext,
  type ServerDataContext,
  type Subscriber,
  type SsrAttributePatch,
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
  SubscriberKind,
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
  ResolvedManifest,
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToStringOptions,
  RenderToStringResult,
  RenderToString,
  RenderToStream,
} from './types';
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
  finalizeComponentOutput(output: SsrOutput, events: UseOnMap): SsrOutput;
  deferSuspense(
    rangeId: number,
    contentQrl: QRL<SsrSuspenseRender>,
    fallbackQrl: QRL<SsrSuspenseRender> | undefined,
    delay: number
  ): ValueOrPromise<SsrOutput>;
  inOrder(): SsrRenderContext;
  styleIds: Map<string, string>;
}

type SsrSuspenseRender = (ctx: SsrRenderContext) => ValueOrPromise<SsrOutput>;

interface DeferredSuspense {
  readonly id: number;
  readonly contentRoot: unknown;
  readonly lane: SsrLane;
  parentId: number | null;
  fallbackRoot?: unknown;
  cancelled?: true;
  output?: SsrOutput;
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
  const result = await renderToStreamCompiled(root, { ...opts, stream }, false);

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
  opts: RenderToStreamOptions<Props>,
  outOfOrder = opts.outOfOrder !== false
): Promise<RenderToStreamResult> => {
  const previousPlatform = getPlatform();
  const resolvedManifest = resolveManifest(opts.manifest);
  const platform = createPlatform(opts, resolvedManifest);
  setPlatform(platform);
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
    serializationCtx.$qrlMapper$ = platform.chunkForSymbol;
    const scripts = new SsrScriptEmitter({
      debug: opts.debug,
      nonce: opts.serverData?.nonce,
      qwikLoader: opts.qwikLoader,
    });
    const styleIds = new Map<string, string>();
    let nextId = 0;
    let deferred: DeferredSuspense[] | undefined;
    let ready: DeferredSuspense[] | undefined;
    let blockedLanes: Set<number> | undefined;
    let wake: (() => void) | undefined;
    let deferredError: unknown;
    let hasDeferredError = false;
    const notifyDeferred = () => {
      const resolve = wake;
      wake = undefined;
      resolve?.();
    };
    const scheduler = new SsrScheduler(notifyDeferred);
    const rootLane = scheduler.createLane(serializationCtx);
    const wrapContent = (rangeId: number, content: SsrOutput): SsrOutput => [
      createSsrRecord('<!d=', createSsrNodeId(rangeId), '>'),
      content,
      '<!/d>',
    ];
    const reparentChildren = (rangeId: number, parentId: number | null) => {
      const records = deferred;
      if (records === undefined) {
        return;
      }
      for (let i = 0; i < records.length; i++) {
        if (records[i].parentId === rangeId) {
          records[i].parentId = parentId;
        }
      }
    };
    const deferSuspense = (
      renderCtx: SsrRenderContext,
      parentId: number | null,
      rangeId: number,
      contentQrl: QRL<SsrSuspenseRender>,
      fallbackQrl: QRL<SsrSuspenseRender> | undefined,
      delay: number,
      allowOutOfOrder: boolean
    ): ValueOrPromise<SsrOutput> => {
      const contentCtx = Object.create(renderCtx) as SsrRenderContext;
      const contentLane = scheduler.createLane(serializationCtx, renderCtx.scheduler);
      contentCtx.scheduler = contentLane;
      contentCtx.deferSuspense = (id, content, fallback, nestedDelay) =>
        deferSuspense(contentCtx, rangeId, id, content, fallback, nestedDelay, allowOutOfOrder);
      let contentRoot: unknown;
      const renderedContent = renderSsrContent(
        contentCtx as any,
        rangeId,
        [],
        contentQrl as any,
        false,
        true,
        (subscription) => (contentRoot = subscription)
      );
      const initialTasks = contentLane.flush();
      const finishContent = (output: SsrOutput) => maybeThen(contentLane.flush(), () => output);
      const content =
        isPromise(renderedContent) && isPromise(initialTasks)
          ? Promise.all([renderedContent, initialTasks]).then(([output]) => finishContent(output))
          : maybeThen(renderedContent, (output) =>
              maybeThen(initialTasks, () => finishContent(output))
            );
      if (!isPromise(content)) {
        reparentChildren(rangeId, parentId);
        return wrapContent(rangeId, content);
      }
      if (!allowOutOfOrder) {
        return content.then((output) => {
          serializationCtx.$addRoot$(contentRoot);
          reparentChildren(rangeId, parentId);
          return wrapContent(rangeId, output);
        });
      }

      const renderFallback = (record: DeferredSuspense): ValueOrPromise<SsrOutput> => {
        if (fallbackQrl === undefined) {
          return wrapContent(rangeId, '');
        }
        const fallbackId = renderCtx.nextId();
        return maybeThen(
          renderSsrContent(
            renderCtx as any,
            fallbackId,
            [],
            fallbackQrl as any,
            false,
            true,
            (subscription) => {
              record.fallbackRoot = subscription;
            }
          ),
          (fallback) => {
            serializationCtx.$addRoot$(record.fallbackRoot);
            return wrapContent(rangeId, wrapContent(fallbackId, fallback));
          }
        );
      };
      const registerDeferred = (): ValueOrPromise<SsrOutput> => {
        const record: DeferredSuspense = { id: rangeId, parentId, contentRoot, lane: contentLane };
        (blockedLanes ??= new Set()).add(contentLane.id);
        (deferred ??= []).push(record);
        content.then(
          (output) => {
            if (record.cancelled) {
              return;
            }
            serializationCtx.$addRoot$(contentRoot);
            record.output = output;
            (ready ??= []).push(record);
            notifyDeferred();
          },
          (error) => {
            if (record.cancelled) {
              return;
            }
            deferredError = error;
            hasDeferredError = true;
            notifyDeferred();
          }
        );
        return renderFallback(record);
      };
      if (!(delay > 0)) {
        return registerDeferred();
      }
      return new Promise<SsrOutput>((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          settled = true;
          resolve(registerDeferred());
        }, delay);
        content.then(
          (output) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              serializationCtx.$addRoot$(contentRoot);
              reparentChildren(rangeId, parentId);
              resolve(wrapContent(rangeId, output));
            }
          },
          (error) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              reject(error);
            }
          }
        );
      });
    };
    const ctx: SsrRenderContext = {
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
      deferSuspense(rangeId, contentQrl, fallbackQrl, delay) {
        return deferSuspense(ctx, null, rangeId, contentQrl, fallbackQrl, delay, outOfOrder);
      },
      inOrder() {
        const inOrderCtx = Object.create(this) as SsrRenderContext;
        inOrderCtx.inOrder = () => inOrderCtx;
        inOrderCtx.deferSuspense = (rangeId, contentQrl, fallbackQrl, delay) =>
          deferSuspense(inOrderCtx, null, rangeId, contentQrl, fallbackQrl, delay, false);
        return inOrderCtx;
      },
      finalizeComponentOutput(output, events): SsrOutput {
        return applyUseOnToSsrOutput(output, events, ctx.eventAttr);
      },
    } satisfies SsrRenderContext;
    rootInvokeContext.container = ctx as any;

    let output = await (locale
      ? withLocale(locale, () => invoke(rootInvokeContext, root, opts.props as Props, ctx))
      : invoke(rootInvokeContext, root, opts.props as Props, ctx));
    if (rootInvokeContext.useOnEvents !== undefined) {
      output = applyUseOnToSsrOutput(output, rootInvokeContext.useOnEvents, ctx.eventAttr);
    }
    if (containerTagName === 'html') {
      output = relocateHeadlessCarriers(output);
    }
    const styledOutput = injectStyles(output, styleIds);
    const emittedStyles = deferred === undefined ? undefined : new Set(styleIds.keys());
    const [containerOpen, containerClose] = createContainerTags(
      containerTagName,
      containerAttributes,
      styledOutput
    );
    const hasDeferred = deferred !== undefined;
    let size = 0;
    const writer = new SsrOutputWriter({
      write(chunk) {
        throwDeferredError(hasDeferredError, deferredError);
        scheduler.throwIfFailed();
        size += chunk.length;
        return opts.stream.write(chunk);
      },
    });
    const findBlockedLane = (lane: SsrLane): number | null => {
      const blocked = blockedLanes;
      if (blocked === undefined) {
        return null;
      }
      let laneId: number | null = lane.id;
      while (laneId !== null) {
        if (blocked.has(laneId)) {
          return laneId;
        }
        laneId = scheduler.lanes[laneId].parentId;
      }
      return null;
    };
    const takePatches = (blockedBy: number | null): SsrAttributePatch[] | null => {
      let patches: SsrAttributePatch[] | null = null;
      for (let i = 0; i < scheduler.lanes.length; i++) {
        const lane = scheduler.lanes[i];
        if (!lane.hasPatches || findBlockedLane(lane) !== blockedBy) {
          continue;
        }
        const lanePatches = lane.takePatches()!;
        if (patches === null) {
          patches = lanePatches;
        } else {
          patches.push(...lanePatches);
        }
      }
      return patches;
    };
    const writePatches = (blockedBy: number | null): ValueOrPromise<void> => {
      const patches = takePatches(blockedBy);
      return patches === null ? undefined : writer.finish(scripts.emitBackpatch(patches));
    };
    const waitForWork = () => new Promise<void>((resolve) => (wake = resolve));
    const throwIfFailed = () => {
      throwDeferredError(hasDeferredError, deferredError);
      scheduler.throwIfFailed();
    };
    const settlePending = async (pending: Promise<void>): Promise<void> => {
      let settled = false;
      const finish = () => {
        settled = true;
        notifyDeferred();
      };
      pending.then(finish, finish);
      while (!settled) {
        throwIfFailed();
        const patches = takePatches(null);
        if (patches !== null) {
          await writer.finish(scripts.emitBackpatch(patches));
        } else {
          await waitForWork();
        }
      }
      await pending;
      await writePatches(null);
    };
    const settlePatches = (): ValueOrPromise<void> => {
      const pending = scheduler.settle();
      return isPromise(pending) ? settlePending(pending) : writePatches(null);
    };
    await writer.finish([containerOpen, styledOutput]);
    throwIfFailed();

    if (hasDeferred) {
      await rootLane.flush();
    } else {
      await settlePatches();
    }
    await writePatches(null);
    throwIfFailed();
    const stateAttrParts = createStateScriptEventAttrs(serializationCtx);
    const shellTail: SsrOutput[] = [];
    if (serializationCtx.$roots$.length > 0) {
      await serializationCtx.$serialize$();
      throwDeferredError(hasDeferredError, deferredError);
      shellTail.push(
        scripts.emitState(
          serializationCtx.$writer$.toString(),
          0,
          serializationCtx.$serializedRootCount$,
          stateAttrParts,
          serializationCtx.$serializedForwardRefCount$ > 0
        )
      );
    }
    if (serializationCtx.$eventQrls$.size > 0 || hasDeferred) {
      shellTail.push(scripts.emitQwikLoader());
      shellTail.push(scripts.emitQwikEvents(serializationCtx.$eventNames$));
    }
    const emittedEvents = hasDeferred ? new Set(serializationCtx.$eventNames$) : undefined;
    if (hasDeferred) {
      shellTail.push(scripts.emitSuspenseRuntime(instanceHash));
    } else {
      shellTail.push(containerClose);
    }
    await writer.finish(shellTail);
    throwIfFailed();

    if (deferred !== undefined) {
      const emitted = new Set<number>();
      while (deferred.some((record) => !record.cancelled && !emitted.has(record.id))) {
        let record: DeferredSuspense | undefined;
        while (record === undefined) {
          throwIfFailed();
          const patches = takePatches(null);
          if (patches !== null) {
            await writer.finish(scripts.emitBackpatch(patches));
            continue;
          }
          const records = ready;
          if (records !== undefined) {
            const index = records.findIndex(
              (candidate) =>
                !candidate.cancelled &&
                (candidate.parentId === null || emitted.has(candidate.parentId))
            );
            if (index !== -1) {
              record = records.splice(index, 1)[0];
              break;
            }
          }
          await waitForWork();
        }
        throwIfFailed();
        const subscriptions = collectDeferredSubscriptions(
          serializationCtx,
          record.contentRoot,
          serializationCtx.$rootStateRootCount$
        );
        const state = await serializationCtx.$serializeNext$();
        throwDeferredError(hasDeferredError, deferredError);
        const packet: SsrOutput[] = [];
        if (state !== null) {
          packet.push(scripts.emitStateRange(state, record.id, subscriptions));
        }
        packet.push(emitNewStyles(styleIds, emittedStyles!));
        const newEvents = takeNewValues(serializationCtx.$eventNames$, emittedEvents!);
        packet.push(scripts.emitQwikEvents(newEvents));
        packet.push(
          scripts.emitResolved(
            record.id,
            record.output!,
            serializationCtx.$hasRootId$(record.contentRoot),
            record.fallbackRoot === undefined
              ? undefined
              : serializationCtx.$hasRootId$(record.fallbackRoot)
          )
        );
        const packetPatches = takePatches(record.lane.id);
        if (packetPatches !== null) {
          packet.push(scripts.emitBackpatch(packetPatches));
        }
        await writer.finish(packet);
        blockedLanes!.delete(record.lane.id);
        throwIfFailed();
        emitted.add(record.id);
        if (record.fallbackRoot !== undefined) {
          disposeSubscriber(record.fallbackRoot as any);
          for (let i = 0; i < deferred.length; i++) {
            const candidate = deferred[i];
            if (
              !candidate.cancelled &&
              (candidate.contentRoot as { owner?: unknown }).owner === null
            ) {
              candidate.cancelled = true;
              blockedLanes!.delete(candidate.lane.id);
              scheduler.cancel(candidate.lane);
            }
          }
        }
      }
      await settlePatches();
      await writer.finish(containerClose);
    }

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

function collectDeferredSubscriptions(
  serializationCtx: SerializationContext,
  contentRoot: unknown,
  serializedRootCount: number
): number[] {
  const root = contentRoot as Subscriber & { content: { currentOwner: Owner | null } };
  const subscribers = new Set<Subscriber>([root]);
  const owners = root.content.currentOwner === null ? [] : [root.content.currentOwner];

  for (let i = 0; i < owners.length; i++) {
    const items = owners[i].items;
    if (items === null) {
      continue;
    }
    const itemCount = Array.isArray(items) ? items.length : 1;
    for (let j = 0; j < itemCount; j++) {
      const item = Array.isArray(items) ? items[j] : items;
      if (item instanceof Owner) {
        owners.push(item);
      } else {
        subscribers.add(item);
      }
    }
  }

  const subscriptions: number[] = [];
  for (const subscriber of subscribers) {
    const subscriberId = serializationCtx.$hasRootId$(subscriber);
    if (
      (subscriberId !== undefined && subscriberId < serializedRootCount) ||
      subscriber.kind === SubscriberKind.Idle ||
      subscriber.deps === null
    ) {
      continue;
    }
    let sourceIds: number[] | null = null;
    for (let i = 0; i < subscriber.deps.length; i++) {
      const source = subscriber.deps[i];
      if (wasSerializedBefore(serializationCtx, source, serializedRootCount)) {
        (sourceIds ??= []).push(serializationCtx.$addRoot$(source));
      }
    }
    if (sourceIds === null) {
      continue;
    }
    const addedSubscriberId = serializationCtx.$addRoot$(subscriber);
    for (let i = 0; i < sourceIds.length; i++) {
      subscriptions.push(sourceIds[i], addedSubscriberId);
    }
  }
  return subscriptions;
}

function wasSerializedBefore(
  serializationCtx: SerializationContext,
  value: unknown,
  serializedRootCount: number
): boolean {
  let ref = serializationCtx.getSeenRef(value);
  if (ref === undefined) {
    return false;
  }
  while (ref.$parent$) {
    ref = ref.$parent$;
  }
  return ref.$index$ < serializedRootCount;
}

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

function emitNewStyles(styles: Map<string, string>, emitted: Set<string>): string {
  let html = '';
  for (const [styleId, content] of styles) {
    if (!emitted.has(styleId)) {
      emitted.add(styleId);
      html += `<style q:style="${escapeHTML(styleId)}">${content}</style>`;
    }
  }
  return html;
}

function takeNewValues(values: ReadonlySet<string>, emitted: Set<string>): Set<string> {
  const added = new Set<string>();
  for (const value of values) {
    if (!emitted.has(value)) {
      emitted.add(value);
      added.add(value);
    }
  }
  return added;
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

function throwDeferredError(hasError: boolean, error: unknown): void {
  if (hasError) {
    throw error;
  }
}

function randomStr() {
  return (Math.random().toString(36) + '000000').slice(2, 8);
}
