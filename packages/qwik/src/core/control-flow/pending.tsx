import { isBrowser } from '@qwik.dev/core/build';
import { qTest } from '../shared/utils/qdev';
import type { Signal } from '../reactive-primitives/signal.public';
import { componentQrl, type Component } from '../shared/component.public';
import { _jsxSorted } from '../shared/jsx/jsx-internal';
import { Slot } from '../shared/jsx/slot.public';
import type { JSXNodeInternal, JSXOutput } from '../shared/jsx/types/jsx-node';
import type { JSXChildren } from '../shared/jsx/types/jsx-qwik-attributes';
import { isServerPlatform } from '../shared/platform/platform';
import { _fnSignal } from '../shared/qrl/inlined-fn';
import { inlinedQrl } from '../shared/qrl/qrl';
import type { QRL } from '../shared/qrl/qrl.public';
import { _captures, type QRLInternal } from '../shared/qrl/qrl-class';
import {
  QCursorBoundary,
  QDefaultSlot,
  QPendingResolved,
  QPendingResultParent,
} from '../shared/utils/markers';
import { resolveSlotName } from '../shared/utils/prop';
import { ERROR_CONTEXT, type CatchStore } from '../shared/error/error-handling';
import { createInternalServerComponent } from '../ssr/internal-server-component';
import { finalizeAndSwapOutOfOrderSegment } from '../ssr/out-of-order-segment-swap';
import type { SSRContainer, SSROutOfOrderSegment, SSRRenderJSXOptions } from '../ssr/ssr-types';
import { useComputedQrl } from '../use/use-computed';
import { tryGetInvokeContext, untrack } from '../use/use-core';
import { useCursorBoundary, type CursorBoundary } from '../use/use-cursor-boundary';
import { useSignal } from '../use/use-signal';
import { useTaskQrl, type TaskCtx } from '../use/use-task';
import { revealCanReveal, useRevealBoundary, type RevealRegistration } from './reveal';
import {
  isOutOfOrderStreaming,
  nextOutOfOrderPendingId,
  PENDING_QRL_SYMBOL,
  type OutOfOrderRevealBoundary,
} from './pending-utils';

type PendingState = 'content' | 'fallback';

type SSROutOfOrderBoundaryState = {
  contentResolved: boolean;
  delay: number;
  delayTimer: ReturnType<typeof setTimeout> | null;
};

/** @public @experimental */
export type PendingProps = {
  fallback$?: QRL<() => JSXOutput>;
  delay?: number;
};

const _hf0 = (
  p0: PendingProps,
  p1: Signal<PendingState>,
  p2: Signal<boolean>,
  p3: RevealRegistration | null
) => ({
  display:
    p1.value === 'fallback' && p0.fallback$ != null && (p2.value || !p3!.reveal.collapsed)
      ? 'contents'
      : 'none',
});
const _hf0_str =
  '{display:p1.value==="fallback"&&p0.fallback$!=null&&(p2.value||!p3.reveal.collapsed)?"contents":"none"}';
const _hf1 = (p0: Signal<PendingState>, p1: Signal<boolean>) => ({
  display: p0.value === 'content' && p1.value ? 'contents' : 'none',
});
const _hf1_str = '{display:p0.value==="content"&&p1.value?"contents":"none"}';

/** @internal */
export const pendingTask = ({ track, cleanup }: TaskCtx) => {
  const cursorBoundary = _captures![0] as CursorBoundary,
    props = _captures![1] as { delay?: number },
    state = _captures![2] as Signal<PendingState>,
    revealRegistration = _captures![3] as RevealRegistration | null;
  const pendingCount = track(cursorBoundary);
  const isBrowserEnv = qTest ? !isServerPlatform() : isBrowser;
  if (revealRegistration !== null && isBrowserEnv) {
    revealRegistration.reveal.version.value++;
  }
  if (!isBrowserEnv || pendingCount === 0) {
    state.value = 'content';
    return;
  }
  const delayTimer = setTimeout(() => {
    if (cursorBoundary.value > 0) {
      state.value = 'fallback';
    }
  }, props.delay ?? 0);
  cleanup(() => clearTimeout(delayTimer));
};

/** @internal */
export const pendingCmp = (props: PendingProps): JSXNodeInternal<string>[] => {
  if (!__EXPERIMENTAL__.pendingBoundary) {
    throw new Error(
      'Pending is experimental and must be enabled with `experimental: ["pendingBoundary"]` in the `qwikVite` plugin.'
    );
  }

  const state = useSignal<PendingState>('content');
  const cursorBoundary = useCursorBoundary();
  const revealRegistration = useRevealBoundary(cursorBoundary);
  const canReveal = useComputedQrl(
    /*#__PURE__*/ inlinedQrl(revealCanReveal, '_reR', [revealRegistration])
  );

  useTaskQrl(
    /*#__PURE__*/ inlinedQrl(pendingTask, '_peT', [
      cursorBoundary,
      props,
      state,
      revealRegistration,
    ])
  );

  const isServerEnv = qTest ? isServerPlatform() : !isBrowser;
  const isServerOutOfOrder = isServerEnv && isOutOfOrderStreaming();
  const outOfOrderBoundaryId = isServerOutOfOrder ? nextOutOfOrderPendingId() : 0;
  const outOfOrderRevealBoundary = isServerOutOfOrder
    ? (revealRegistration?.reveal.ooos?.register(revealRegistration) ?? null)
    : null;
  const showOutOfOrderFallback =
    isServerOutOfOrder &&
    untrack(() => props.fallback$ != null) &&
    (outOfOrderRevealBoundary === null || outOfOrderRevealBoundary.showFallback);
  const outOfOrderBoundaryState =
    showOutOfOrderFallback && isPositiveDelay(props.delay)
      ? { contentResolved: false, delay: props.delay, delayTimer: null }
      : null;
  const contentStyle = /*#__PURE__*/ _fnSignal(_hf1, [state, canReveal], _hf1_str);
  const fallback = props.fallback$
    ? (props.fallback$ as QRLInternal<() => JSXOutput>).getFn(tryGetInvokeContext())()
    : null;

  const fallbackHost = (
    isServerOutOfOrder
      ? /*#__PURE__*/ _jsxSorted(
          SSRFallback,
          {
            boundary: outOfOrderBoundaryState,
            fallbackStyle: _fnSignal(_hf0, [props, state, canReveal, revealRegistration], _hf0_str),
            showFallback: showOutOfOrderFallback,
            state,
          },
          null,
          fallback,
          1,
          null
        )
      : /*#__PURE__*/ _jsxSorted(
          'div',
          {
            style: _fnSignal(_hf0, [props, state, canReveal, revealRegistration], _hf0_str),
          },
          null,
          fallback,
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
            [QPendingResultParent]: String(outOfOrderBoundaryId),
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
export const Pending: Component<PendingProps> = /*#__PURE__*/ componentQrl<PendingProps>(
  /*#__PURE__*/ inlinedQrl(pendingCmp, PENDING_QRL_SYMBOL)
);

type SSRFallbackProps = {
  boundary: SSROutOfOrderBoundaryState | null;
  fallbackStyle: Signal<{ display: string }>;
  showFallback: boolean;
  state: Signal<PendingState>;
};

const SSRFallback = __EXPERIMENTAL__.pendingBoundary
  ? /*#__PURE__*/ createInternalServerComponent<SSRFallbackProps>((ssr, jsx, _options, enqueue) => {
      const boundaryState = jsx.varProps.boundary as SSROutOfOrderBoundaryState | null;
      const fallbackStyle = jsx.varProps.fallbackStyle as Signal<{ display: string }>;
      const showFallback = jsx.varProps.showFallback === true;
      const state = jsx.varProps.state as Signal<PendingState>;
      if (showFallback) {
        if (boundaryState) {
          enqueue(() => scheduleOutOfOrderFallbackDelay(ssr, boundaryState, state));
        } else {
          state.value = 'fallback';
        }
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

const SSRDeferredSlot = __EXPERIMENTAL__.pendingBoundary
  ? /*#__PURE__*/ createInternalServerComponent<SSRDeferredSlotProps>(async (ssr, jsx, options) => {
      const boundaryId = jsx.varProps.boundaryId as number;
      const contentSegment = `${boundaryId}`;
      const boundaryState = jsx.varProps.boundary as SSROutOfOrderBoundaryState | null;
      const contentStyle = jsx.varProps.contentStyle as Signal<{ display: string }>;
      const revealBoundary = jsx.varProps.reveal as OutOfOrderRevealBoundary | null;
      const catchStore =
        __EXPERIMENTAL__.catchBoundary && options.parentComponentFrame
          ? (ssr.resolveContext(options.parentComponentFrame.componentNode, ERROR_CONTEXT) as
              | CatchStore
              | undefined)
          : undefined;
      const content = ssr.segment(
        contentSegment,
        createClaimedDeferredSlot(ssr, jsx, options),
        options
      );

      ssr.write(`<template ${QPendingResolved}="${boundaryId}"></template>`);
      ssr.emitOutOfOrderExecutorIfNeeded();
      ssr.queueOutOfOrderSegment(
        content
          .then((rendered) =>
            emitRenderedOutOfOrderSegment(
              ssr,
              boundaryId,
              rendered,
              contentStyle,
              revealBoundary,
              boundaryState
            )
          )
          .catch((error) => {
            if (catchStore?.$emitFallback$) {
              return catchStore.$emitFallback$(error);
            }
            if (catchStore?.error !== undefined) {
              return;
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
  rendered: SSROutOfOrderSegment,
  contentStyle: Signal<{ display: string }>,
  revealBoundary: OutOfOrderRevealBoundary | null,
  boundaryState: SSROutOfOrderBoundaryState | null
): Promise<void> {
  if (boundaryState) {
    boundaryState.contentResolved = true;
    if (boundaryState.delayTimer) {
      clearTimeout(boundaryState.delayTimer);
      boundaryState.delayTimer = null;
    }
  }
  revealBoundary?.resolve();
  await ssr.$runQueuedRender$(async () => {
    ssr.addRoot(contentStyle);
    await finalizeAndSwapOutOfOrderSegment(ssr, boundaryId, rendered, revealBoundary);
  });
}

function scheduleOutOfOrderFallbackDelay(
  ssr: SSRContainer,
  boundaryState: SSROutOfOrderBoundaryState,
  state: Signal<PendingState>
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
  }, boundaryState.delay);
}

function isPositiveDelay(delay: number | undefined): delay is number {
  return typeof delay === 'number' && Number.isFinite(delay) && delay > 0;
}
