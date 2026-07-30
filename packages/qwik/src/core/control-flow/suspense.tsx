import { isBrowser, isDev } from '@qwik.dev/core/build';
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
  QErrorFallbackHost,
  QSuspenseResolved,
  QSuspenseResultParent,
} from '../shared/utils/markers';
import { resolveSlotName } from '../shared/utils/prop';
import { noSerialize } from '../shared/serdes/verify';
import { isOutOfOrderSegmentContainer } from '../shared/utils/container';
import { createInternalServerComponent } from '../ssr/internal-server-component';
import type { SSRContainer, SSROutOfOrderSegment, SSRRenderJSXOptions } from '../ssr/ssr-types';
import {
  ERROR_CONTEXT,
  isErrorFromDeferredSegment,
  markBoundaryErrored,
  redactBoundaryErrorForDisplay,
  type ErrorBoundaryStore,
} from '../shared/error/error-handling';
import { useComputedQrl } from '../use/use-computed';
import { untrack } from '../use/use-core';
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
  delay: number;
  delayTimer: ReturnType<typeof setTimeout> | null;
};

/** @public @experimental */
export type SuspenseProps = {
  fallback?: JSXOutput;
  delay?: number;
};

const _hf0 = (
  p0: SuspenseProps,
  p1: Signal<SuspenseState>,
  p2: Signal<boolean>,
  p3: RevealRegistration | null
) => ({
  display:
    p1.value === 'fallback' &&
    p0.fallback != null &&
    p0.fallback !== false &&
    (p2.value || !p3!.reveal.collapsed)
      ? 'contents'
      : 'none',
});
const _hf0_str =
  '{display:p1.value==="fallback"&&p0.fallback!=null&&p0.fallback!==false&&(p2.value||!p3.reveal.collapsed)?"contents":"none"}';
const _hf1 = (p0: Signal<SuspenseState>, p1: Signal<boolean>) => ({
  display: p0.value === 'content' && p1.value ? 'contents' : 'none',
});
const _hf1_str = '{display:p0.value==="content"&&p1.value?"contents":"none"}';

/** @internal */
export const suspenseTask = ({ track, cleanup }: TaskCtx) => {
  const cursorBoundary = _captures![0] as CursorBoundary,
    props = _captures![1] as { delay?: number },
    state = _captures![2] as Signal<SuspenseState>,
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
    isServerOutOfOrder &&
    untrack(() => props.fallback != null && props.fallback !== false) &&
    (outOfOrderRevealBoundary === null || outOfOrderRevealBoundary.showFallback);
  const outOfOrderBoundaryState =
    showOutOfOrderFallback && isPositiveDelay(props.delay)
      ? { contentResolved: false, delay: props.delay, delayTimer: null }
      : null;
  const contentStyle = /*#__PURE__*/ _fnSignal(_hf1, [state, canReveal], _hf1_str);

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
  fallbackStyle: Signal<{ display: string }>;
  showFallback: boolean;
  state: Signal<SuspenseState>;
};

const SSRFallback = __EXPERIMENTAL__.suspense
  ? /*#__PURE__*/ createInternalServerComponent<SSRFallbackProps>((ssr, jsx, _options, enqueue) => {
      const boundaryState = jsx.varProps.boundary as SSROutOfOrderBoundaryState | null;
      const fallbackStyle = jsx.varProps.fallbackStyle as Signal<{ display: string }>;
      const showFallback = jsx.varProps.showFallback === true;
      const state = jsx.varProps.state as Signal<SuspenseState>;
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

const SSRDeferredSlot = __EXPERIMENTAL__.suspense
  ? /*#__PURE__*/ createInternalServerComponent<SSRDeferredSlotProps>(async (ssr, jsx, options) => {
      const boundaryId = jsx.varProps.boundaryId as number;
      const contentSegment = `${boundaryId}`;
      const boundaryState = jsx.varProps.boundary as SSROutOfOrderBoundaryState | null;
      const contentStyle = jsx.varProps.contentStyle as Signal<{ display: string }>;
      const revealBoundary = jsx.varProps.reveal as OutOfOrderRevealBoundary | null;
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

      ssr.write(`<template ${QSuspenseResolved}="${boundaryId}"></template>`);
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
            if (errorBoundaryStore) {
              if (errorBoundaryStore.$emitFallback$) {
                return errorBoundaryStore.$emitFallback$(error);
              }
              if (errorBoundaryStore.error !== undefined) {
                return;
              }
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

async function finalizeAndSwapOutOfOrderSegment(
  ssr: SSRContainer,
  boundaryId: number,
  segmentId: string,
  rendered: SSROutOfOrderSegment,
  revealBoundary: OutOfOrderRevealBoundary | null,
  emitExecutor: boolean
): Promise<void> {
  const result = await rendered.container.$finalizeOutOfOrderSegment$(segmentId, rendered);
  ssr.write(`<template ${QSuspenseResolved}="${boundaryId}"${revealBoundary?.attrs ?? ''}>`);
  ssr.write(result.html);
  ssr.write('</template>');
  ssr.emitOutOfOrderSegmentScripts(result.scripts);
  if (emitExecutor) {
    ssr.emitOutOfOrderExecutorIfNeeded();
  }
  ssr.emitInlineScript(`qO(${boundaryId})`);
  const errorSwapIds = rendered.container.$errorSwapIds$;
  if (__EXPERIMENTAL__.errorBoundary && errorSwapIds.length) {
    ssr.emitErrorSwapExecutorIfNeeded();
    for (let i = 0; i < errorSwapIds.length; i++) {
      ssr.emitInlineScript(`qErr(${errorSwapIds[i]})`);
    }
  }
  // qO() is the browser-visible handoff for this segment, so flush it immediately.
  await ssr.streamHandler.flush();
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
    await finalizeAndSwapOutOfOrderSegment(
      ssr,
      boundaryId,
      segmentId,
      rendered,
      revealBoundary,
      false
    );
  });
}

export const SSRErrorFallback = __EXPERIMENTAL__.errorBoundary
  ? /*#__PURE__*/ createInternalServerComponent<{ boundaryId: number; store: ErrorBoundaryStore }>(
      (ssr, jsx, options) => {
        const boundaryId = jsx.varProps.boundaryId as number;
        const store = jsx.varProps.store as ErrorBoundaryStore;
        const segmentId = `${boundaryId}`;
        const streamFallback = async (error: unknown): Promise<void> => {
          const fallback = store.$fallback$;
          if (!fallback) {
            return;
          }
          // The catch site already recorded it; marking again refires onError$.
          if (store.error !== error) {
            markBoundaryErrored(store, error, 'render');
          }
          delete store.$fallback$;
          const projected = redactBoundaryErrorForDisplay(store.error, isDev, ssr.$transformError$);
          const segment = await ssr.segment(segmentId, fallback(projected) as JSXOutput, options);
          await emitErrorBoundaryFallback(ssr, boundaryId, segmentId, segment);
        };
        store.$emitFallback$ = noSerialize(streamFallback);
        ssr.write(`<template ${QSuspenseResolved}="${boundaryId}"></template>`);
        if (store.error !== undefined && store.$fallback$) {
          return streamFallback(store.error);
        }
      }
    )
  : null!;

export const SSRErrorFallbackInline = __EXPERIMENTAL__.errorBoundary
  ? /*#__PURE__*/ createInternalServerComponent<{ boundaryId: number; store: ErrorBoundaryStore }>(
      (ssr, jsx, _options, enqueue) => {
        const boundaryId = jsx.varProps.boundaryId as number;
        const store = jsx.varProps.store as ErrorBoundaryStore;
        if (store.error !== undefined && store.$fallback$) {
          const fallback = store.$fallback$;
          delete store.$fallback$;
          const projected = redactBoundaryErrorForDisplay(store.error, isDev, ssr.$transformError$);
          if (isOutOfOrderSegmentContainer(ssr)) {
            ssr.$registerErrorSwap$(boundaryId);
            enqueue(fallback(projected) as JSXOutput);
          } else {
            enqueue(() => {
              ssr.emitErrorSwapExecutorIfNeeded();
              ssr.emitInlineScript(`qErr(${boundaryId})`);
            });
            enqueue(fallback(projected) as JSXOutput);
          }
        }
      }
    )
  : null!;

export const SSRErrorFallbackHost = __EXPERIMENTAL__.errorBoundary
  ? /*#__PURE__*/ createInternalServerComponent<{
      boundaryId: number;
      store: ErrorBoundaryStore;
      hostStyle: string;
    }>((ssr, jsx, _options, enqueue) => {
      const boundaryId = jsx.varProps.boundaryId as number;
      const store = jsx.varProps.store as ErrorBoundaryStore;
      const hostStyle = jsx.varProps.hostStyle as string;
      const deliverLate =
        __EXPERIMENTAL__.suspense &&
        ssr.outOfOrderStreaming &&
        !isOutOfOrderSegmentContainer(ssr) &&
        (store.error === undefined || isErrorFromDeferredSegment(store));
      enqueue(
        /*#__PURE__*/ _jsxSorted(
          'div',
          {
            [deliverLate ? QSuspenseResultParent : QErrorFallbackHost]: String(boundaryId),
            style: hostStyle,
          },
          null,
          /*#__PURE__*/ _jsxSorted(
            deliverLate ? SSRErrorFallback : SSRErrorFallbackInline,
            { boundaryId, store },
            null,
            null,
            1,
            null
          ),
          1,
          null
        )
      );
    })
  : null!;

async function emitErrorBoundaryFallback(
  ssr: SSRContainer,
  boundaryId: number,
  segmentId: string,
  rendered: SSROutOfOrderSegment
): Promise<void> {
  // qErr hides the errored content host and strips its broadcast handlers.
  rendered.container.$registerErrorSwap$(boundaryId);
  await ssr.$runQueuedRender$(() =>
    finalizeAndSwapOutOfOrderSegment(ssr, boundaryId, segmentId, rendered, null, true)
  );
}
function scheduleOutOfOrderFallbackDelay(
  ssr: SSRContainer,
  boundaryState: SSROutOfOrderBoundaryState,
  state: Signal<SuspenseState>
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
