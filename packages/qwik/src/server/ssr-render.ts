import { createSsrPublication, getDeferredContentOwner } from './ssr-publication';
import {
  createContainerAttributes,
  resolveDocumentStart,
  relocateHeadlessCarriers,
  createContainerOpenTag,
  hasDocumentSections,
  ensureDocument,
  takeDocumentEnd,
  insertAtSection,
  wrapDocumentRange,
} from './ssr-document';
import {
  createSerializationContext,
  createSsrNodeId,
  createSsrMarkup,
  disposeOwner,
  disposeSubscriber,
  getActiveInvokeContextOrNull,
  handleError,
  getPlatform,
  invoke,
  isPromise,
  newInvokeContext,
  setPlatform,
  SsrOutputWriter,
  type SerializationContext,
  type SsrRangeScope,
  type Subscriber,
  type SsrAttributePatch,
  type SsrEventAttrChunk,
  type SsrDeferredRange,
  type SsrCatchController,
  type RuntimeInvokeContext,
  type SsrOutput,
  type SsrReferenceChunk,
  withLocale,
  isQwikComponent,
  renderSsrDynamicContent,
  runOwnerCleanups,
  type JSXOutput,
  type QRLInternal,
} from '@qwik.dev/core';
import { type ValueOrPromise, applyUseOnToSsrOutput, SubscriberFlags } from './qwik-copy';
import { SsrScriptEmitter } from './ssr-script-emitter';
import { SsrScheduler, type SsrLane } from './ssr-scheduler';
import { SsrDomRef, setSsrRef } from './ssr-ref';
import { StringWriter } from './string-writer';
import type {
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
import { createPreloaderHead, createPreloaderTail } from './preloader';

export interface SsrRenderContext extends SsrRangeScope {
  serializationCtx: SerializationContext;
  scheduler: SsrLane;
  setRef(value: unknown, nodeId: number): void;
  ownOutput(output: SsrOutput, context: RuntimeInvokeContext, subscription?: Subscriber): SsrOutput;
  markEagerResume(value: object): void;
  /** Null when the component ended up providing no context. */
  optionalContextScopeRef(): SsrReferenceChunk | null;
  eventAttr(name: string, value: unknown, needsInvokeContext?: boolean): SsrEventAttrChunk;
  /** Flat-output form: ` name="…"` as string/reference parts, [] when there are no handlers. */
  eventAttrParts(name: string, value: unknown, needsInvokeContext?: boolean): SsrEventAttrChunk[];
  /** The table script of a compiler-placed sync handler, written right before its element. */
  syncFn(qrl: QRLInternal): SsrReferenceChunk;
  observeError(output: ValueOrPromise<SsrOutput>): SsrOutput;
  createRangeScope(rangeId: number): SsrRenderContext;
  markCaughtError(): void;
  inOrder(): SsrRenderContext;
  styleIds: Map<string, string>;
  registerSsrStyle(id: string, content: string): void;
}

/** A deferred range plus the engine's own lane bookkeeping. */
interface DeferredRange extends SsrDeferredRange {
  lane: SsrLane;
  emitted?: boolean;
  observation?: DeferredObservation;
}

interface DeferredObservation {
  record?: DeferredRange;
  ready?: (record: DeferredRange, output: SsrOutput) => void;
  failed?: (error: unknown) => void;
}

function detachDeferred(observation: DeferredObservation): void {
  observation.record = observation.ready = observation.failed = undefined;
}

function observeDeferred(content: Promise<SsrOutput>, observation: DeferredObservation): void {
  content.then(
    (output) => {
      const record = observation.record;
      if (record !== undefined) {
        observation.ready?.(record, output);
        record.observation = undefined;
      }
      detachDeferred(observation);
    },
    (error) => {
      observation.failed?.(error);
      detachDeferred(observation);
    }
  );
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
  const rootInvokeContext = newInvokeContext({ ids: { next: 0 } });
  let releaseRuntime: (() => void) | undefined;

  try {
    const containerTagName = opts.containerTagName ?? 'html';
    const buildBase = getBuildBase(opts);
    const locale = getLocale(opts);
    const instanceHash = opts.instanceHash ?? randomStr();
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
    let nextId = 0;
    let deferred: DeferredRange[] | undefined;
    let ready: DeferredRange[] | undefined;
    let blockedLanes: Set<number> | undefined;
    let wake: (() => void) | undefined;
    let deferredError: unknown;
    let hasDeferredError = false;
    let shellCleanup: ReturnType<SerializationContext['$beginTransaction$']> | undefined;
    const notifyDeferred = () => {
      const resolve = wake;
      wake = undefined;
      resolve?.();
    };
    const scheduler = new SsrScheduler(notifyDeferred);
    const rootLane = scheduler.createLane();
    releaseRuntime = () => {
      publication.cancel();
      scheduler.cancel(rootLane);
      scheduler.release();
      for (let recordIndex = 0; recordIndex < (deferred?.length ?? 0); recordIndex++) {
        const record = deferred![recordIndex];
        if (record.observation !== undefined) {
          detachDeferred(record.observation);
        }
        record.output = record.contentRoot = record.placeholderRoot = undefined;
      }
      deferred = ready = undefined;
      wake = undefined;
    };
    const reportError = (boundary: SsrCatchController | undefined, error: unknown): void => {
      shellCleanup?.cancel();
      const fail = (error: unknown) => {
        deferredError = error;
        hasDeferredError = true;
        publication.cancel();
        notifyDeferred();
      };
      try {
        const handled = handleError(boundary?.owner ?? null, error);
        if (isPromise(handled)) {
          handled.catch(fail);
        }
      } catch (error) {
        fail(error);
      }
    };
    const publication = createSsrPublication(serializationCtx, scripts, instanceHash, {
      write(frame) {
        size += frame.length;
        return opts.stream.write(frame);
      },
      reportError,
      throwIfFailed: () => throwIfFailed(),
      hasDeferredError: () => hasDeferredError,
      takePatches: (blockedBy) => takePatches(blockedBy),
    });
    const { styleIds, commitSubscribers, selectShellStyles, materializeChunk } = publication;
    const wrapContent = (rangeId: number, content: SsrOutput): SsrOutput =>
      wrapDocumentRange(createSsrMarkup('<!d=', createSsrNodeId(rangeId), '>'), content);
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
    /** A child range: its work runs on its own lane and ranges opened inside it nest under it. */
    let hasCaughtError = false;
    const createRangeScope = (
      parent: SsrRenderContext,
      parentRangeId: number | null,
      rangeId: number
    ): SsrRenderContext => {
      const scope = Object.create(parent) as SsrRenderContext;
      const lane = scheduler.createLane(parent.scheduler);
      scope.scheduler = lane;
      lane.catchError = (error) => reportError(scope.catchBoundary, error);
      scope.createRangeScope = (childId) => createRangeScope(scope, rangeId, childId);
      scope.flush = () => lane.flush();
      scope.cancel = () => {
        scheduler.cancel(lane);
        publication.cancelScope(scope.catchBoundary);
        for (let recordIndex = 0; recordIndex < (deferred?.length ?? 0); recordIndex++) {
          const record = deferred![recordIndex];
          if (!record.cancelled && record.lane.isCancelled) {
            record.cancelled = true;
            record.output = undefined;
            if (record.observation !== undefined) {
              detachDeferred(record.observation);
              record.observation = undefined;
            }
            record.onCancelled?.();
            record.onCancelled = record.onEmitted = undefined;
            blockedLanes?.delete(record.lane.id);
            disposeSubscriber(record.contentRoot as Subscriber);
          }
        }
        ready = ready?.filter((record) => !record.cancelled);
        deferred = deferred?.filter((record) => !record.cancelled);
        notifyDeferred();
      };
      scope.reparentRanges = () => reparentChildren(rangeId, parentRangeId);
      scope.defer = (range, content) => {
        const record = range as DeferredRange;
        (record.contentRoot as Subscriber).flags |= SubscriberFlags.Deferred;
        record.parentId = parentRangeId;
        record.lane = lane;
        (blockedLanes ??= new Set()).add(lane.id);
        (deferred ??= []).push(record);
        const observation: DeferredObservation = {
          record,
          ready(record, output) {
            if (record.cancelled) {
              return;
            }
            record.output = output;
            (ready ??= []).push(record);
            notifyDeferred();
          },
          failed(error) {
            reportError(scope.catchBoundary, error);
          },
        };
        record.observation = observation;
        observeDeferred(content, observation);
      };
      return scope;
    };
    const ctx: SsrRenderContext = {
      serializationCtx,
      observeError(output) {
        // Observe eager children immediately; the writer still propagates their error in order.
        if (!isPromise(output)) {
          return output;
        }
        const pending = Promise.resolve(output);
        pending.catch(() => {});
        return pending;
      },
      scheduler: rootLane,
      styleIds,
      serverData: opts.serverData,
      nextId() {
        return nextId++;
      },
      setRef(value, nodeId) {
        setSsrRef(value, nodeId, { $addRoot$: (value) => this.addRoot(value) });
      },
      addRoot: publication.addRoot,
      registerSsrStyle: publication.registerSsrStyle,
      ownOutput: publication.ownOutput,
      markEagerResume: publication.markEagerResume,
      optionalContextScopeRef() {
        const scope = getActiveInvokeContextOrNull()?.localContextScope ?? null;
        return scope === null
          ? null
          : { type: 'root-value', value: scope, boundary: this.catchBoundary };
      },
      // `getLocale()` inside a resumed handler reads the container, so localized apps wrap.
      eventAttr(name, value, needsInvokeContext = false) {
        const boundary =
          this?.catchBoundary ??
          getActiveInvokeContextOrNull<SsrRenderContext>()?.container?.catchBoundary;
        const attribute: SsrEventAttrChunk = {
          type: 'event-attr',
          name,
          valueParts: [
            {
              type: 'event-value',
              name,
              value,
              needsInvokeContext: needsInvokeContext || locale !== '',
              boundary,
            },
          ],
        };
        const errorRoot = catchReference(boundary);
        return errorRoot === undefined ? attribute : { ...attribute, errorRoot };
      },
      eventAttrParts(name, value, needsInvokeContext = false) {
        return [ctx.eventAttr.call(this, name, value, needsInvokeContext)];
      },
      syncFn(qrl) {
        return { type: 'sync-fn', qrl };
      },
      wrapRange(rangeId, content) {
        return wrapContent(rangeId, content);
      },
      createRangeScope(rangeId) {
        return createRangeScope(this, null, rangeId);
      },
      flush() {
        return rootLane.flush();
      },
      defer() {
        throw new Error('Only a range scope can defer.');
      },
      reparentRanges() {},
      canDefer: outOfOrder,
      markCaughtError() {
        hasCaughtError = true;
        shellCleanup?.cancel();
      },
      inOrder() {
        const inOrderCtx = Object.create(this) as SsrRenderContext;
        inOrderCtx.inOrder = () => inOrderCtx;
        inOrderCtx.canDefer = false;
        inOrderCtx.createRangeScope = (rangeId) => createRangeScope(inOrderCtx, null, rangeId);
        return inOrderCtx;
      },
    } satisfies SsrRenderContext;
    rootInvokeContext.container = ctx;

    let output: SsrOutput = await (locale
      ? withLocale(locale, () => invoke(rootInvokeContext, root, opts.props as Props, ctx))
      : invoke(rootInvokeContext, root, opts.props as Props, ctx));
    output = ctx.ownOutput(output, rootInvokeContext);
    if (rootInvokeContext.useOnEvents !== undefined) {
      output = await applyUseOnToSsrOutput(output, rootInvokeContext.useOnEvents, ctx.eventAttr);
    }
    if (containerTagName === 'html') {
      if (!hasDocumentSections(output)) {
        output = await resolveDocumentStart(output);
      }
      output = relocateHeadlessCarriers(ensureDocument(output));
    }
    const qwikLoaderBundle = resolvedManifest?.manifest.qwikLoader;
    const isQwikLoaderModule = scripts.isQwikLoaderModule(qwikLoaderBundle);
    const headScripts =
      (isQwikLoaderModule ? scripts.emitQwikLoaderModule(buildBase + qwikLoaderBundle) : '') +
      createPreloaderHead(
        resolvedManifest?.manifest,
        buildBase,
        opts.preloader,
        opts.serverData?.nonce
      );
    if (headScripts !== '') {
      output =
        containerTagName === 'html'
          ? insertAtSection(output, 'head', [headScripts], 'after')
          : [headScripts, output];
    }
    selectShellStyles(output);
    const styledOutput = publication.injectStyles(output, containerTagName === 'html');
    const containerOpen = createContainerOpenTag(containerTagName, containerAttributes);
    // The state and loader scripts belong inside the body, so its close waits for them
    const bodyEnd = containerTagName === 'html' ? takeDocumentEnd(styledOutput) : null;
    const shellOutput = bodyEnd === null ? styledOutput : bodyEnd[0];
    const containerClose: SsrOutput = [
      bodyEnd === null ? '' : bodyEnd[1],
      `</${containerTagName}>`,
    ];
    let hasDeferred = deferred !== undefined;
    let size = 0;
    const writer = new SsrOutputWriter(
      {
        write(chunk) {
          throwDeferredError(hasDeferredError, deferredError);
          scheduler.throwIfFailed();
          size += chunk.length;
          return opts.stream.write(chunk);
        },
      },
      (resolved) => {
        selectShellStyles(resolved);
        return flush([publication.emitStyles(), resolved]);
      },
      materializeChunk,
      publication.publishCatch
    );
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
        const lanePatches = lane.takePatches(serializationCtx.$journal$)!;
        if (patches === null) {
          patches = serializationCtx.$journal$ === undefined ? lanePatches : lanePatches.slice();
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
    const flush = (output: SsrOutput): ValueOrPromise<void> =>
      writer.finish(publication.prepareShellOutput(output));
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
    // the container opens first so any table entry lands inside it, before the element
    await writer.finish(containerOpen);
    await flush(shellOutput);
    hasDeferred = deferred !== undefined;
    commitSubscribers();
    throwIfFailed();

    if (hasDeferred) {
      await rootLane.flush();
    } else {
      await settlePatches();
    }
    await writePatches(null);
    throwIfFailed();
    if (rootInvokeContext.owner !== null) {
      // Cleanups may write state, so they run before it is serialized
      const transaction = (shellCleanup = serializationCtx.$beginTransaction$(false));
      try {
        await transaction.waitFor(
          runOwnerCleanups(rootInvokeContext.owner, getDeferredContentOwner)
        );
      } finally {
        transaction.rollback();
        shellCleanup = undefined;
      }
      throwIfFailed();
    }
    const shellTail: SsrOutput[] = [];
    const shellState = publication.publishShellState();
    if (isPromise(shellState)) {
      await shellState;
    }
    hasDeferred = deferred !== undefined;
    shellTail.push(
      createPreloaderTail(
        serializationCtx,
        resolvedManifest?.manifest,
        buildBase,
        opts.preloader,
        opts.serverData?.nonce
      )
    );
    if (serializationCtx.$eventQrls$.size > 0 || hasDeferred) {
      if (!isQwikLoaderModule) {
        shellTail.push(scripts.emitQwikLoader());
      }
      shellTail.push(scripts.emitQwikEvents(serializationCtx.$eventNames$));
    }
    if (hasDeferred) {
      publication.markShellEventsEmitted();
      shellTail.push(scripts.emitPendingRuntime(instanceHash));
    } else {
      shellTail.push(containerClose);
    }
    await flush(shellTail);
    throwIfFailed();

    if (deferred !== undefined) {
      const emitted = new Set<number>();
      while (deferred.some((record) => !record.cancelled && !record.emitted)) {
        let record: DeferredRange | undefined;
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
                !candidate.emitted &&
                (candidate.parentId === null || emitted.has(candidate.parentId)) &&
                (candidate.canEmit?.() ?? true)
            );
            if (index !== -1) {
              record = records.splice(index, 1)[0];
              break;
            }
          }
          await waitForWork();
        }
        throwIfFailed();
        const published = await publication.publishRange(record);
        if (!published) {
          if (!record.cancelled) {
            (ready ??= []).push(record);
          }
          throwIfFailed();
          continue;
        }
        blockedLanes!.delete(record.lane.id);
        throwIfFailed();
        emitted.add(record.id);
        record.emitted = true;
        (record.contentRoot as Subscriber).flags &= ~SubscriberFlags.Deferred;
        record.output = undefined;
        record.onEmitted?.();
        record.onEmitted = record.onCancelled = undefined;
        notifyDeferred();
        if (record.placeholderRoot !== undefined) {
          disposeSubscriber(record.placeholderRoot as any);
          for (let i = 0; i < deferred.length; i++) {
            const candidate = deferred[i];
            if (
              !candidate.cancelled &&
              (candidate.contentRoot as { owner?: unknown }).owner === null
            ) {
              candidate.cancelled = true;
              // a cancelled range must not gate whatever its owner is ordering it against
              candidate.onCancelled?.();
              blockedLanes!.delete(candidate.lane.id);
              scheduler.cancel(candidate.lane);
            }
          }
        }
      }
      await settlePatches();
      await flush(containerClose);
    }

    return {
      flushes: 0,
      size,
      hasCaughtError,
      isStatic: serializationCtx.$roots$.length === 0 && serializationCtx.$eventQrls$.size === 0,
      manifest: resolvedManifest?.manifest,
      snapshotResult: {
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
    releaseRuntime?.();
    if (rootInvokeContext.owner !== null) {
      disposeOwner(rootInvokeContext.owner);
    }
    setPlatform(previousPlatform);
  }
};

/**
 * The public root is JSX (the v2 contract), which the compiler hands over as a JSX value; a
 * component is accepted as the shorthand for `<Root />`.
 */
const renderRoot = <Props>(root: unknown): SsrRenderRoot<Props> =>
  isQwikComponent(root)
    ? (root as SsrRenderRoot<Props>)
    : (_props, ctx) => renderSsrDynamicContent(root as JSXOutput, ctx);

/** @public */
export const renderToString = ((root: unknown, opts?: RenderToStringOptions) =>
  renderToStringCompiled(renderRoot(root), opts)) as RenderToString;
/** @public */
export const renderToStream = ((root: unknown, opts: RenderToStreamOptions) =>
  renderToStreamCompiled(renderRoot(root), opts)) as RenderToStream;

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

function catchReference(boundary: SsrCatchController | undefined): SsrReferenceChunk | undefined {
  const value = boundary?.owner?.catchBoundary;
  return value === undefined ? undefined : { type: 'root-value', value, boundary };
}
