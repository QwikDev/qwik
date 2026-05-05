import { isBrowser, isDev } from '@qwik.dev/core/build';
import { _wrapProp } from '../reactive-primitives/internal-api';
import type { Signal } from '../reactive-primitives/signal.public';
import { componentQrl } from '../shared/component.public';
import { _jsxSorted } from '../shared/jsx/jsx-internal';
import { Fragment, type Props } from '../shared/jsx/jsx-runtime';
import { directGetPropsProxyProp } from '../shared/jsx/props-proxy';
import { Slot } from '../shared/jsx/slot.public';
import type { JSXOutput } from '../shared/jsx/types/jsx-node';
import { isServerPlatform } from '../shared/platform/platform';
import { _fnSignal } from '../shared/qrl/inlined-fn';
import { inlinedQrl } from '../shared/qrl/qrl';
import { _captures } from '../shared/qrl/qrl-class';
import {
  QCursorBoundary,
  QSuspense,
  QSuspenseEnd,
  QSuspenseFallback,
  QSuspenseResolved,
} from '../shared/utils/markers';
import { createInternalServerComponent } from '../ssr/internal-server-component';
import type { SSRContainer, SSRRenderJSXOptions, SSRSlotReplayRecords } from '../ssr/ssr-types';
import { useComputedQrl } from '../use/use-computed';
import { useCursorBoundary, type CursorBoundary } from '../use/use-cursor-boundary';
import { useSignal } from '../use/use-signal';
import { useTaskQrl, type TaskCtx } from '../use/use-task';
import { revealCanReveal, useRevealBoundary, type RevealRegistration } from './reveal';
import {
  isOutOfOrderStreaming,
  SUSPENSE_QRL_SYMBOL,
  type OutOfOrderRevealBoundary,
  type OutOfOrderRevealBoundaryRegistration,
} from './suspense-utils';
import { DEBUG_TYPE, VirtualType } from '../shared/types';
import { EMPTY_OBJ } from '../shared/utils/flyweight';

type SuspenseState = 'content' | 'fallback';

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
    (p2 === null || p2.value) && (p1.value === 'content' || p0.showStale) ? 'contents' : 'none',
});
const _hf1_str =
  '{display:(p2===null||p2.value)&&(p1.value==="content"||p0.showStale)?"contents":"none"}';

/** @internal */
export const suspenseTask = ({ track, cleanup }: TaskCtx) => {
  const cursorBoundary = _captures![0] as CursorBoundary,
    props = _captures![1] as { delay?: number },
    state = _captures![2] as Signal<SuspenseState>,
    revealRegistration = _captures![3] as RevealRegistration | null;
  const pendingCount = track(cursorBoundary.pending);
  const isBrowserEnv = import.meta.env.TEST ? !isServerPlatform() : isBrowser;
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
export const suspenseCmp = (props: SuspenseProps) => {
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

  const isServerEnv = import.meta.env.TEST ? isServerPlatform() : !isBrowser;
  if (__EXPERIMENTAL__.suspense && isServerEnv && isOutOfOrderStreaming()) {
    const revealBoundaryRegistration =
      revealRegistration?.reveal.ooos?.boundary(revealRegistration) ?? null;
    return /*#__PURE__*/ _jsxSorted(
      SSRSuspense,
      {
        fallback: props.fallback,
        reveal: revealBoundaryRegistration,
      },
      null,
      /*#__PURE__*/ _jsxSorted(
        Slot,
        {
          [QCursorBoundary]: cursorBoundary,
        },
        null,
        null,
        3,
        'u6_0'
      ),
      1,
      'u6_2'
    );
  }

  return /*#__PURE__*/ _jsxSorted(
    Fragment,
    null,
    null,
    [
      /*#__PURE__*/ _jsxSorted(
        'div',
        {
          style: _fnSignal(_hf0, [props, state, canReveal, revealRegistration], _hf0_str),
        },
        null,
        _wrapProp(props, 'fallback'),
        1,
        null
      ),
      /*#__PURE__*/ _jsxSorted(
        'div',
        null,
        {
          style: _fnSignal(_hf1, [props, state, canReveal], _hf1_str),
        },
        /*#__PURE__*/ _jsxSorted(
          Slot,
          {
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
    ],
    1,
    'u6_1'
  );
};

/** @public @experimental */
export const Suspense = /*#__PURE__*/ componentQrl<SuspenseProps>(
  /*#__PURE__*/ inlinedQrl(suspenseCmp, SUSPENSE_QRL_SYMBOL)
) as typeof suspenseCmp;

type SSRSuspenseProps = {
  fallback?: JSXOutput;
  reveal: OutOfOrderRevealBoundaryRegistration | null;
};

const SSRSuspense = __EXPERIMENTAL__.suspense
  ? /*#__PURE__*/ createInternalServerComponent<SSRSuspenseProps>(async (ssr, jsx, options) => {
      const boundaryId = ssr.nextOutOfOrderId();
      const contentSegment = `s${boundaryId}`;
      const children = jsx.children as JSXOutput;
      const fallback = directGetPropsProxyProp<JSXOutput, unknown>(jsx, 'fallback');
      const reveal = directGetPropsProxyProp<OutOfOrderRevealBoundaryRegistration | null, unknown>(
        jsx,
        'reveal'
      );
      const segmentOptions = { ...options };
      const slotReplayRecords: SSRSlotReplayRecords = new Map();
      const content = await ssr.segment(contentSegment, children, {
        ...segmentOptions,
        promiseMode: 'suspense-capture',
        slotReplay: {
          mode: 'record',
          records: slotReplayRecords,
        },
      });

      const suspended = content.suspended;
      const revealBoundary = suspended ? (reveal?.register() ?? null) : null;
      ssr.openFragment(isDev ? { [DEBUG_TYPE]: VirtualType.Fragment } : EMPTY_OBJ);
      ssr.commentNode(QSuspense + boundaryId);
      await renderSuspenseJSXHost(
        ssr,
        createFallbackHostProps(
          boundaryId,
          suspended && shouldRenderFallback(fallback, revealBoundary) ? 'contents' : 'none',
          revealBoundary
        ),
        fallback,
        {
          ...segmentOptions,
          promiseMode: 'normal',
        }
      );
      await renderSuspenseHTMLHost(
        ssr,
        {
          [QSuspenseResolved]: `${boundaryId}`,
          style: { display: suspended ? 'none' : 'contents' },
        },
        suspended ? '' : content.html
      );
      ssr.commentNode(QSuspenseEnd + boundaryId);
      ssr.closeFragment();
      if (!suspended) {
        ssr.queueOutOfOrderSegment(emitOutOfOrderSegmentScripts(ssr, content.scripts));
        return;
      }
      ssr.emitOutOfOrderExecutorIfNeeded();
      await ssr.streamHandler.flush();

      ssr.queueOutOfOrderSegment(
        emitResolvedOutOfOrderSegment(
          ssr,
          boundaryId,
          contentSegment,
          children,
          segmentOptions,
          suspended,
          revealBoundary,
          slotReplayRecords
        )
      );
    })
  : null!;

async function emitResolvedOutOfOrderSegment(
  ssr: SSRContainer,
  boundaryId: number,
  segmentId: string,
  children: JSXOutput,
  options: SSRRenderJSXOptions,
  firstPromise: Promise<unknown>,
  revealBoundary: OutOfOrderRevealBoundary | null,
  slotReplayRecords: SSRSlotReplayRecords
): Promise<void> {
  await firstPromise;
  const rendered = await ssr.runQueuedRenderBeforeRootState(async () => {
    const rendered = await ssr.segment(segmentId, children, {
      ...options,
      promiseMode: 'normal',
      slotReplay: {
        mode: 'replay',
        records: slotReplayRecords,
      },
    });
    writeOutOfOrderResolvedTemplate(ssr, boundaryId, rendered.html, revealBoundary);
    ssr.emitInlineScript(`qO(${boundaryId})`);
    await ssr.streamHandler.flush();
    return rendered;
  });
  await emitOutOfOrderSegmentScripts(ssr, rendered.scripts);
}

async function emitOutOfOrderSegmentScripts(ssr: SSRContainer, scripts: string): Promise<void> {
  if (!scripts) {
    return;
  }
  await ssr.waitForRootContainerReady();
  await ssr.runQueuedRender(async () => {
    ssr.write(scripts);
    ssr.emitInlineScript('qO.p()');
    await ssr.streamHandler.flush();
  });
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

async function renderSuspenseHTMLHost(
  ssr: SSRContainer,
  props: Props,
  html: string
): Promise<void> {
  ssr.openElement('div', null, props, null, null, null);
  ssr.write(html);
  await ssr.closeElement();
}

async function renderSuspenseJSXHost(
  ssr: SSRContainer,
  props: Props,
  jsx: JSXOutput,
  options: SSRRenderJSXOptions
): Promise<void> {
  ssr.openElement('div', null, props, null, null, null);
  if (jsx != null) {
    await ssr.renderJSX(jsx, options);
  }
  await ssr.closeElement();
}

function createFallbackHostProps(
  boundaryId: number,
  display: 'contents' | 'none',
  revealBoundary: OutOfOrderRevealBoundary | null
): Props {
  return {
    [QSuspenseFallback]: `${boundaryId}`,
    ...(revealBoundary?.props ?? null),
    style: { display },
  };
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
