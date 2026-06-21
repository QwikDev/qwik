import { isBrowser } from '@qwik.dev/core/build';
import { isOutOfOrderActive, nextErrorBoundaryId } from '../../control-flow/suspense-utils';
import { SSRErrorFallback } from '../../control-flow/suspense';
import { useErrorBoundaryStore } from '../../use/use-error-boundary-store';
import { componentQrl, type Component } from '../component.public';
import { _jsxSorted } from '../jsx/jsx-internal';
import { Fragment } from '../jsx/jsx-runtime';
import { Slot } from '../jsx/slot.public';
import type { JSXOutput } from '../jsx/types/jsx-node';
import { isServerPlatform } from '../platform/platform';
import { _fnSignal } from '../qrl/inlined-fn';
import { inlinedQrl } from '../qrl/qrl';
import type { QRL } from '../qrl/qrl.public';
import { noSerialize } from '../serdes/verify';
import { QErrorContentHost, QErrorFallbackHost, QSuspenseResultParent } from '../utils/markers';
import { qTest } from '../utils/qdev';
import type { ErrorBoundaryStore } from './error-handling';

/** @public */
export interface ErrorBoundaryProps {
  /** Rendered in place of the subtree when a descendant throws; lazily loaded, receives the error. */
  fallback$: QRL<(error: any) => any>;
}

// Core isn't run through the optimizer, so ErrorBoundary is hand-built with `inlinedQrl` (symbol
// `_ebC`) rather than `component$`.

// "has errored" is `error !== undefined`, not truthiness, so a thrown falsy value (`0`, `null`, …)
// still shows the fallback.
const _ebContentStyle = (store: ErrorBoundaryStore) => ({
  display: store.error !== undefined ? 'none' : 'contents',
});
const _ebContentStyle_str = '{display:p0.error!==undefined?"none":"contents"}';
const _ebFallbackStyle = (store: ErrorBoundaryStore) => ({
  display: store.error !== undefined ? 'contents' : 'none',
});
const _ebFallbackStyle_str = '{display:p0.error!==undefined?"contents":"none"}';

/** @internal */
export const errorBoundaryCmp = (props: ErrorBoundaryProps): JSXOutput => {
  const store = useErrorBoundaryStore();
  // `noSerialize` taints identity; wrap in a fresh closure so it doesn't taint the shared `fallback$`
  // QRL and drop its serialized prop.
  const fallbackQrl = props.fallback$;
  store.$fallback$ = noSerialize((error: any) => fallbackQrl(error));

  const isServerEnv = qTest ? isServerPlatform() : !isBrowser;
  // SSR: ONE never-buffer two-host swap for every mode. Content streams live into the content-host
  // (`q:ebc`); the sibling fallback-host (`q:ebf`) delivers the fallback. The swap is `qErr(id)` when
  // the fallback is in place (sync / in-order / buffered), or `qO` when it's delivered late (a
  // deferred `<Suspense>` throw) — so the fallback-host is also a `q:rp` delivery target when
  // out-of-order streaming is available.
  if (__EXPERIMENTAL__.errorBoundary && isServerEnv) {
    const boundaryId = nextErrorBoundaryId();
    const fallbackHostProps: Record<string, unknown> = {
      [QErrorFallbackHost]: String(boundaryId),
      style: /*#__PURE__*/ _fnSignal(_ebFallbackStyle, [store], _ebFallbackStyle_str),
    };
    if (isOutOfOrderActive()) {
      fallbackHostProps[QSuspenseResultParent] = String(boundaryId);
    }
    return [
      /*#__PURE__*/ _jsxSorted(
        'div',
        {
          [QErrorContentHost]: String(boundaryId),
          style: /*#__PURE__*/ _fnSignal(_ebContentStyle, [store], _ebContentStyle_str),
        },
        null,
        /*#__PURE__*/ _jsxSorted(Slot, null, null, null, 0, null),
        1,
        null
      ),
      /*#__PURE__*/ _jsxSorted(
        'div',
        fallbackHostProps,
        null,
        /*#__PURE__*/ _jsxSorted(SSRErrorFallback, { boundaryId, store }, null, null, 1, null),
        1,
        null
      ),
    ] as unknown as JSXOutput;
  }

  if (store.error !== undefined) {
    return /*#__PURE__*/ _jsxSorted(Fragment, null, null, props.fallback$(store.error), 0, null);
  }

  return /*#__PURE__*/ _jsxSorted(Slot, null, null, null, 0, null);
};

/** @public */
export const ErrorBoundary: Component<ErrorBoundaryProps> =
  /*#__PURE__*/ componentQrl<ErrorBoundaryProps>(
    /*#__PURE__*/ inlinedQrl(errorBoundaryCmp, '_ebC')
  );
