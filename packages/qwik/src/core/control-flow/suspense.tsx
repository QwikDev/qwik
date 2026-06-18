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
import { createInternalServerComponent } from '../ssr/internal-server-component';
import type { SSRContainer, SSROutOfOrderSegment, SSRRenderJSXOptions } from '../ssr/ssr-types';
import { isDeferredBoundaryError } from '../shared/error/error-handling';
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
          // A throw from an enclosing <ErrorBoundary> that deferred its subtree arrives here as a
          // DeferredBoundaryError; swap that boundary's fallback into this same placeholder.
          .catch((error) =>
            emitOutOfOrderErrorFallback(
              ssr,
              boundaryId,
              error,
              options,
              contentStyle,
              revealBoundary,
              boundaryState
            )
          )
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
 * A deferred (out-of-order) segment rejected. If the throw came from an `<ErrorBoundary>` that
 * deferred its subtree (a DeferredBoundaryError carrying the boundary store), render that
 * boundary's fallback into a fresh segment and inject it into the same placeholder — the partial
 * (failed) segment was already discarded by `ssr.segment`. Anything else rethrows, aborting as
 * before.
 */
async function emitOutOfOrderErrorFallback(
  ssr: SSRContainer,
  boundaryId: number,
  thrown: unknown,
  options: SSRRenderJSXOptions,
  contentStyle: Signal<{ display: string }>,
  revealBoundary: OutOfOrderRevealBoundary | null,
  boundaryState: SSROutOfOrderBoundaryState | null
): Promise<void> {
  if (!__EXPERIMENTAL__.errorBoundary || !isDeferredBoundaryError(thrown)) {
    throw thrown;
  }
  const { store, error } = thrown;
  if (!store.$fallback$) {
    throw error;
  }
  store.error = error;
  const fallbackSegment = `${ssr.nextOutOfOrderId()}`;
  const rendered = await ssr.segment(
    fallbackSegment,
    store.$fallback$(error) as JSXOutput,
    options
  );
  return emitRenderedOutOfOrderSegment(
    ssr,
    boundaryId,
    fallbackSegment,
    rendered,
    contentStyle,
    revealBoundary,
    boundaryState
  );
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

function writeOutOfOrderPlaceholder(ssr: SSRContainer, boundaryId: number): void {
  ssr.write(`<template ${QSuspenseResolved}="${boundaryId}"></template>`);
}

function writeOutOfOrderResolvedTemplate(
  ssr: SSRContainer,
  boundaryId: number,
  html: string,
  revealBoundary: OutOfOrderRevealBoundary | null
): void {
  ssr.write(`<template ${QSuspenseResolved}="${boundaryId}"${revealBoundary?.attrs ?? ''}>`);
  ssr.write(html);
  ssr.write('</template>');
}
