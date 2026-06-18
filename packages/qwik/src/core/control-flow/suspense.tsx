import { isBrowser } from '@qwik.dev/core/build';
import { qTest } from '../shared/utils/qdev';
import { _wrapProp } from '../reactive-primitives/internal-api';
import type { Signal } from '../reactive-primitives/signal.public';
import { componentQrl } from '../shared/component.public';
import { _jsxSorted } from '../shared/jsx/jsx-internal';
import { Slot } from '../shared/jsx/slot.public';
import type { JSXNodeInternal, JSXOutput } from '../shared/jsx/types/jsx-node';
import type { JSXChildren } from '../shared/jsx/types/jsx-qwik-attributes';
import { isServerPlatform } from '../shared/platform/platform';
import { _fnSignal } from '../shared/qrl/inlined-fn';
import { inlinedQrl } from '../shared/qrl/qrl';
import { _captures } from '../shared/qrl/qrl-class';
import {
  QCursorBoundary,
  QDefaultSlot,
  QSuspenseResolved,
  QSuspenseResultParent,
} from '../shared/utils/markers';
import { resolveSlotName } from '../shared/utils/prop';
import { noSerialize } from '../shared/serdes/verify';
import { createInternalServerComponent } from '../ssr/internal-server-component';
import type { SSRContainer, SSROutOfOrderSegment, SSRRenderJSXOptions } from '../ssr/ssr-types';
import { ERROR_CONTEXT, type ErrorBoundaryStore } from '../shared/error/error-handling';
import { useComputedQrl } from '../use/use-computed';
import { useCursorBoundary, type CursorBoundary } from '../use/use-cursor-boundary';
import { useSignal } from '../use/use-signal';
import { useTaskQrl, type TaskCtx } from '../use/use-task';
import { revealCanReveal, useRevealBoundary, type RevealRegistration } from './reveal';
import {
  isOutOfOrderStreaming,
  nextOutOfOrderSuspenseId,
  SUSPENSE_QRL_SYMBOL,
  type OutOfOrderRevealBoundary,
} from './suspense-utils';

type SuspenseState = 'content' | 'fallback';

type SSROutOfOrderBoundaryState = {
  contentResolved: boolean;
  delayTimer: ReturnType<typeof setTimeout> | null;
};

/** @public @experimental */
export type SuspenseProps = {
  fallback?: JSXOutput;
  showStale?: boolean;
  delay?: number;
};

const _hf0 = (
  p0: SuspenseProps,
  p1: Signal<SuspenseState>,
  p2: Signal<boolean> | null,
  p3: RevealRegistration | null
) => ({
  display:
    p1.value === 'fallback' &&
    p0.fallback != null &&
    p0.fallback !== false &&
    (p2 === null || p2.value || !p3!.reveal.collapsed)
      ? 'contents'
      : 'none',
});
const _hf0_str =
  '{display:p1.value==="fallback"&&p0.fallback!=null&&p0.fallback!==false&&(p2===null||p2.value||!p3.reveal.collapsed)?"contents":"none"}';
const _hf1 = (p0: SuspenseProps, p1: Signal<SuspenseState>, p2: Signal<boolean> | null) => ({
  display:
    (p1.value === 'content' || p0.showStale) && (p2 === null || p2.value) ? 'contents' : 'none',
});
const _hf1_str =
  '{display:(p1.value==="content"||p0.showStale)&&(p2===null||p2.value)?"contents":"none"}';

/** @internal */
export const suspenseTask = ({ track, cleanup }: TaskCtx) => {
  const cursorBoundary = _captures![0] as CursorBoundary,
    props = _captures![1] as { delay?: number },
    state = _captures![2] as Signal<SuspenseState>,
    revealRegistration = _captures![3] as RevealRegistration | null;
  const pendingCount = track(cursorBoundary.pending);
  const isBrowserEnv = qTest ? !isServerPlatform() : isBrowser;
  if (revealRegistration !== null && isBrowserEnv) {
    revealRegistration.reveal.version.value++;
  }
  if (!isBrowserEnv || pendingCount === 0) {
    state.value = 'content';
    return;
  }
  const delayTimer = setTimeout(() => {
    if (cursorBoundary.pending.value > 0) {
      state.value = 'fallback';
    }
  }, props.delay ?? 0);
  cleanup(() => clearTimeout(delayTimer));
};

/** @internal */
export const suspenseCmp = (props: SuspenseProps): JSXNodeInternal<string>[] => {
  if (!__EXPERIMENTAL__.suspense) {
    throw new Error(
      'Suspense is experimental and must be enabled with `experimental: ["suspense"]` in the `qwikVite` plugin.'
    );
  }

  const state = useSignal<SuspenseState>('content');
  const cursorBoundary = useCursorBoundary();
  const revealRegistration = useRevealBoundary(cursorBoundary);
  const canReveal = useComputedQrl(
    /*#__PURE__*/ inlinedQrl(revealCanReveal, '_reR', [revealRegistration])
  );

  useTaskQrl(
    /*#__PURE__*/ inlinedQrl(suspenseTask, '_suT', [
      cursorBoundary,
      props,
      state,
      revealRegistration,
    ])
  );

  const isServerEnv = qTest ? isServerPlatform() : !isBrowser;
  const isServerOutOfOrder = isServerEnv && isOutOfOrderStreaming();
  const outOfOrderBoundaryId = isServerOutOfOrder ? nextOutOfOrderSuspenseId() : 0;
  const outOfOrderRevealBoundary = isServerOutOfOrder
    ? (revealRegistration?.reveal.ooos?.register(revealRegistration) ?? null)
    : null;
  const showOutOfOrderFallback =
    isServerOutOfOrder && shouldRenderFallback(props.fallback, outOfOrderRevealBoundary);
  const outOfOrderBoundaryState =
    showOutOfOrderFallback && isPositiveDelay(props.delay)
      ? { contentResolved: false, delayTimer: null }
      : null;
  const outOfOrderFallbackStyle = isServerOutOfOrder
    ? /*#__PURE__*/ _fnSignal(_hf0, [props, state, canReveal, revealRegistration], _hf0_str)
    : null;
  const contentStyle = /*#__PURE__*/ _fnSignal(_hf1, [props, state, canReveal], _hf1_str);

  const fallbackHost = (
    isServerOutOfOrder
      ? /*#__PURE__*/ _jsxSorted(
          SSRFallback,
          {
            boundary: outOfOrderBoundaryState,
            delay: props.delay,
            fallbackStyle: outOfOrderFallbackStyle!,
            showFallback: showOutOfOrderFallback,
            state,
          },
          null,
          _wrapProp(props, 'fallback'),
          1,
          null
        )
      : /*#__PURE__*/ _jsxSorted(
          'div',
          {
            style: _fnSignal(_hf0, [props, state, canReveal, revealRegistration], _hf0_str),
          },
          null,
          _wrapProp(props, 'fallback'),
          1,
          null
        )
  ) as JSXNodeInternal<string>;

  return [
    fallbackHost,
    /*#__PURE__*/ _jsxSorted(
      'div',
      null,
      isServerOutOfOrder
        ? {
            [QSuspenseResultParent]: String(outOfOrderBoundaryId),
            style: contentStyle,
          }
        : {
            style: contentStyle,
          },
      /*#__PURE__*/ _jsxSorted(
        isServerOutOfOrder ? SSRDeferredSlot : Slot,
        isServerOutOfOrder
          ? {
              [QCursorBoundary]: cursorBoundary,
              boundary: outOfOrderBoundaryState,
              boundaryId: outOfOrderBoundaryId,
              contentStyle,
              reveal: outOfOrderRevealBoundary,
            }
          : {
              [QCursorBoundary]: cursorBoundary,
            },
        null,
        null,
        3,
        'u6_0'
      ),
      1,
      null
    ),
  ];
};

/** @public @experimental */
export const Suspense = /*#__PURE__*/ componentQrl<SuspenseProps>(
  /*#__PURE__*/ inlinedQrl(suspenseCmp, SUSPENSE_QRL_SYMBOL)
) as typeof suspenseCmp;

type SSRFallbackProps = {
  boundary: SSROutOfOrderBoundaryState | null;
  delay?: number;
  fallbackStyle: Signal<{ display: string }>;
  showFallback: boolean;
  state: Signal<SuspenseState>;
};

const SSRFallback = __EXPERIMENTAL__.suspense
  ? /*#__PURE__*/ createInternalServerComponent<SSRFallbackProps>((ssr, jsx, _options, enqueue) => {
      const boundaryState = jsx.varProps.boundary as SSROutOfOrderBoundaryState | null;
      const delay = jsx.varProps.delay as number | undefined;
      const fallbackStyle = jsx.varProps.fallbackStyle as Signal<{ display: string }>;
      const showFallback = jsx.varProps.showFallback === true;
      const state = jsx.varProps.state as Signal<SuspenseState>;
      if (showFallback && !isPositiveDelay(delay)) {
        state.value = 'fallback';
      } else if (boundaryState && showFallback && isPositiveDelay(delay)) {
        enqueue(() => scheduleOutOfOrderFallbackDelay(ssr, boundaryState, state, delay));
      }
      enqueue(
        /*#__PURE__*/ _jsxSorted(
          'div',
          {
            style: fallbackStyle,
          },
          null,
          jsx.children as JSXOutput,
          1,
          null
        )
      );
    })
  : null!;

type SSRDeferredSlotProps = {
  boundary: SSROutOfOrderBoundaryState | null;
  boundaryId: number;
  contentStyle: Signal<{ display: string }>;
  reveal: OutOfOrderRevealBoundary | null;
};

const SSRDeferredSlot = __EXPERIMENTAL__.suspense
  ? /*#__PURE__*/ createInternalServerComponent<SSRDeferredSlotProps>(async (ssr, jsx, options) => {
      const boundaryId = (jsx.varProps.boundaryId as number | undefined) ?? ssr.nextOutOfOrderId();
      const contentSegment = `${boundaryId}`;
      const boundaryState = jsx.varProps.boundary as SSROutOfOrderBoundaryState | null;
      const contentStyle = jsx.varProps.contentStyle as Signal<{ display: string }>;
      const revealBoundary = jsx.varProps.reveal as OutOfOrderRevealBoundary | null;
      // Capture the nearest enclosing <ErrorBoundary> up front. If this deferred segment later
      // rejects (e.g. an async child threw after the placeholder was already streamed), route that
      // boundary's fallback into this same placeholder instead of aborting the whole render. The
      // boundary's own buffer-and-swap can't catch this because it already committed once the
      // Suspense placeholder rendered. Gated by the experimental errorBoundary feature.
      const errorBoundaryStore =
        __EXPERIMENTAL__.errorBoundary && options.parentComponentFrame
          ? (ssr.resolveContext(options.parentComponentFrame.componentNode, ERROR_CONTEXT) as
              | ErrorBoundaryStore
              | undefined)
          : undefined;
      const content = ssr.segment(
        contentSegment,
        createClaimedDeferredSlot(ssr, jsx, options),
        options
      );

      writeOutOfOrderPlaceholder(ssr, boundaryId);
      ssr.emitOutOfOrderExecutorIfNeeded();
      ssr.queueOutOfOrderSegment(
        content
          .then((rendered) =>
            emitRenderedOutOfOrderSegment(
              ssr,
              boundaryId,
              contentSegment,
              rendered,
              contentStyle,
              revealBoundary,
              boundaryState
            )
          )
          .catch((error) => {
            // A deferred child threw after its placeholder streamed, so the enclosing boundary
            // already committed and can't catch it in place. Route it to that boundary's fallback
            // host instead: the whole boundary (this Suspense included) is torn down to `fallback$`,
            // matching the boundary's intent rather than wedging the fallback into this slot.
            if (errorBoundaryStore && errorBoundaryStore.$emitFallback$) {
              return errorBoundaryStore.$emitFallback$(error);
            }
            throw error;
          })
      );
    })
  : null!;

function createClaimedDeferredSlot(
  ssr: SSRContainer,
  jsx: JSXNodeInternal,
  options: SSRRenderJSXOptions
): ReturnType<typeof _jsxSorted> {
  const componentFrame = options.parentComponentFrame;
  if (!componentFrame) {
    return /*#__PURE__*/ _jsxSorted(
      Slot,
      jsx.varProps,
      jsx.constProps,
      jsx.children,
      jsx.flags,
      jsx.key
    );
  }
  const slotName = resolveSlotName(componentFrame.componentNode, jsx, ssr);
  const slotDefaultChildren = (jsx.children || null) as JSXChildren | null;
  const slotChildren =
    (
      componentFrame as unknown as { claimChildrenForSlot(slotName: string): JSXChildren | null }
    ).claimChildrenForSlot(slotName) || slotDefaultChildren;
  if (slotDefaultChildren && slotChildren !== slotDefaultChildren) {
    ssr.addUnclaimedProjection(componentFrame, QDefaultSlot, slotDefaultChildren);
  }
  return /*#__PURE__*/ _jsxSorted(
    Slot,
    jsx.varProps,
    jsx.constProps,
    slotChildren,
    jsx.flags,
    jsx.key
  );
}

async function emitRenderedOutOfOrderSegment(
  ssr: SSRContainer,
  boundaryId: number,
  segmentId: string,
  rendered: SSROutOfOrderSegment,
  contentStyle: Signal<{ display: string }>,
  revealBoundary: OutOfOrderRevealBoundary | null,
  boundaryState: SSROutOfOrderBoundaryState | null
): Promise<void> {
  markOutOfOrderContentResolved(boundaryState);
  revealBoundary?.resolve();
  await ssr.$runQueuedRender$(async () => {
    ssr.addRoot(contentStyle);
    const result = await rendered.container.$finalizeOutOfOrderSegment$(segmentId, rendered);
    writeOutOfOrderResolvedTemplate(ssr, boundaryId, result.html, revealBoundary);
    ssr.emitOutOfOrderSegmentScripts(result.scripts);
    ssr.emitInlineScript(`qO(${boundaryId})`);
    // qO() is the browser-visible handoff for this segment, so flush it immediately.
    await ssr.streamHandler.flush();
  });
}

/**
 * SSR host for a streaming `<ErrorBoundary>`'s fallback. Lives inside the boundary's hidden
 * fallback host (`q:rp={boundaryId}`) and writes the out-of-order placeholder. When the boundary's
 * subtree throws — synchronously during the content render, or later from a deferred child
 * `<Suspense>` — `store.$emitFallback$` streams `fallback$(error)` as an out-of-order segment and
 * the shared `qO` executor injects it here while hiding the content host. The boundary never blocks
 * streaming: its content streams first, then the fallback swaps in if (and only if) it errors.
 */
export const SSRErrorFallback = __EXPERIMENTAL__.errorBoundary
  ? /*#__PURE__*/ createInternalServerComponent<{ boundaryId: number; store: ErrorBoundaryStore }>(
      (ssr, jsx, options) => {
        const boundaryId = jsx.varProps.boundaryId as number;
        const store = jsx.varProps.store as ErrorBoundaryStore;
        const segmentId = `${boundaryId}`;
        // Render `fallback$` as an out-of-order segment and inject it (template + inline `qO(id)`)
        // into this fallback host. Returns the emission promise so the caller can await it in stream
        // order — a synchronous throw awaits it inline (below) so the swap script follows the content
        // immediately instead of landing at end-of-stream; a later async throw awaits it through the
        // rejected Suspense segment's promise chain.
        const streamFallback = async (error: unknown): Promise<void> => {
          store.error = error;
          // Detach the fallback while it renders: if the fallback itself throws and resolves back to
          // THIS boundary, it must not re-render the fallback (infinite loop / deadlock). With no
          // `$fallback$`, that throw takes the "no boundary handles it" path and propagates up.
          const fallback = store.$fallback$!;
          store.$fallback$ = undefined;
          try {
            const segment = await ssr.segment(segmentId, fallback(error) as JSXOutput, options);
            await emitErrorBoundaryFallback(ssr, boundaryId, segmentId, segment);
          } finally {
            store.$fallback$ = fallback;
          }
        };
        store.$emitFallback$ = noSerialize(streamFallback);
        // Just reserve the injection point. The shared `qO` executor is emitted lazily (in
        // `emitErrorBoundaryFallback`, only when a boundary actually throws), so an error-free page
        // ships neither the executor nor any `qO(id)` call.
        writeOutOfOrderPlaceholder(ssr, boundaryId);
        // A throw during the content render already set `store.error` before this host renders (the
        // content host is our previous sibling). Returning the promise awaits the swap inline.
        if (store.error != null && store.$fallback$) {
          return streamFallback(store.error);
        }
      }
    )
  : null!;

/** Inject a streamed `<ErrorBoundary>` fallback segment into its fallback host via `qO`. */
async function emitErrorBoundaryFallback(
  ssr: SSRContainer,
  boundaryId: number,
  segmentId: string,
  rendered: SSROutOfOrderSegment
): Promise<void> {
  await ssr.$runQueuedRender$(async () => {
    const result = await rendered.container.$finalizeOutOfOrderSegment$(segmentId, rendered);
    writeOutOfOrderResolvedTemplate(ssr, boundaryId, result.html, null);
    ssr.emitOutOfOrderSegmentScripts(result.scripts);
    // Install the shared executor (idempotent) right before its first call, so error-free pages
    // never ship it.
    ssr.emitOutOfOrderExecutorIfNeeded();
    ssr.emitInlineScript(`qO(${boundaryId})`);
    // qO() is the browser-visible swap (hide content host, reveal fallback host), so flush now.
    await ssr.streamHandler.flush();
  });
}

function markOutOfOrderContentResolved(boundaryState: SSROutOfOrderBoundaryState | null): void {
  if (!boundaryState) {
    return;
  }
  boundaryState.contentResolved = true;
  if (boundaryState.delayTimer) {
    clearTimeout(boundaryState.delayTimer);
    boundaryState.delayTimer = null;
  }
}

function scheduleOutOfOrderFallbackDelay(
  ssr: SSRContainer,
  boundaryState: SSROutOfOrderBoundaryState,
  state: Signal<SuspenseState>,
  delay: number
): void {
  boundaryState.delayTimer = setTimeout(() => {
    boundaryState.delayTimer = null;
    void ssr.$runQueuedRender$(async () => {
      if (boundaryState.contentResolved) {
        return;
      }
      state.value = 'fallback';
      ssr.emitBackpatchDataAndExecutorIfNeeded();
      await ssr.streamHandler.flush();
    });
  }, delay);
}

function isPositiveDelay(delay: number | undefined): delay is number {
  return typeof delay === 'number' && Number.isFinite(delay) && delay > 0;
}

function shouldRenderFallback(
  fallback: JSXOutput,
  revealBoundary: OutOfOrderRevealBoundary | null
): boolean {
  return (
    fallback != null &&
    fallback !== false &&
    (revealBoundary === null || revealBoundary.showFallback)
  );
}

export function writeOutOfOrderPlaceholder(ssr: SSRContainer, boundaryId: number): void {
  ssr.write(`<template ${QSuspenseResolved}="${boundaryId}"></template>`);
}

export function writeOutOfOrderResolvedTemplate(
  ssr: SSRContainer,
  boundaryId: number,
  html: string,
  revealBoundary: OutOfOrderRevealBoundary | null
): void {
  ssr.write(`<template ${QSuspenseResolved}="${boundaryId}"${revealBoundary?.attrs ?? ''}>`);
  ssr.write(html);
  ssr.write('</template>');
}
