import { isBrowser } from '@qwik.dev/core/build';
import { _wrapProp } from '../reactive-primitives/internal-api';
import type { Signal } from '../reactive-primitives/signal.public';
import { componentQrl } from '../shared/component.public';
import { _jsxSorted } from '../shared/jsx/jsx-internal';
import { Fragment } from '../shared/jsx/jsx-runtime';
import { Slot } from '../shared/jsx/slot.public';
import type { JSXOutput } from '../shared/jsx/types/jsx-node';
import { isServerPlatform } from '../shared/platform/platform';
import { _fnSignal } from '../shared/qrl/inlined-fn';
import { inlinedQrl } from '../shared/qrl/qrl';
import { _captures } from '../shared/qrl/qrl-class';
import { QCursorBoundary } from '../shared/utils/markers';
import { useComputedQrl } from '../use/use-computed';
import { useCursorBoundary, type CursorBoundary } from '../use/use-cursor-boundary';
import { useSignal } from '../use/use-signal';
import { useTaskQrl, type TaskCtx } from '../use/use-task';
import { revealCanReveal, useRevealBoundary, type RevealRegistration } from './reveal';

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
  if (revealRegistration !== null) {
    revealRegistration.reveal.version.value++;
  }
  const isBrowserEnv = import.meta.env.TEST ? !isServerPlatform() : isBrowser;
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
  /*#__PURE__*/ inlinedQrl(suspenseCmp, '_suC')
) as typeof suspenseCmp;
