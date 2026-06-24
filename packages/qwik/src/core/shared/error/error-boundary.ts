import { isBrowser } from '@qwik.dev/core/build';
import { isOutOfOrderStreaming, nextErrorBoundaryId } from '../../control-flow/suspense-utils';
import { SSRErrorFallback, SSRErrorFallbackInline } from '../../control-flow/suspense';
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
  /** Rendered in place of the subtree when a descendant throws. */
  fallback$: QRL<(error: any) => any>;
  /** Side-effect fired once per caught error; never affects rendering. */
  onError$?: QRL<(error: unknown) => void>;
}

// Core isn't run through the optimizer, so ErrorBoundary is hand-built with `inlinedQrl`.

// Test against `undefined`, not truthiness, so a thrown falsy value still shows the fallback.
const _ebContentStyle = (store: ErrorBoundaryStore) => ({
  display: store.error !== undefined ? 'none' : 'contents',
});
const _ebContentStyle_str = '{display:p0.error!==undefined?"none":"contents"}';
const _ebFallbackStyle = (store: ErrorBoundaryStore) => ({
  display: store.error !== undefined ? 'contents' : 'none',
});
const _ebFallbackStyle_str = '{display:p0.error!==undefined?"contents":"none"}';

// Both server branches render the same two display-toggled hosts; they differ only in the
// fallback-host marker and which fallback component delivers the swap.
const buildErrorBoundaryHosts = (
  store: ErrorBoundaryStore,
  fallbackHostMarker: string,
  FallbackComponent: typeof SSRErrorFallback
): JSXOutput => {
  const boundaryId = nextErrorBoundaryId();
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
      {
        [fallbackHostMarker]: String(boundaryId),
        style: /*#__PURE__*/ _fnSignal(_ebFallbackStyle, [store], _ebFallbackStyle_str),
      },
      null,
      /*#__PURE__*/ _jsxSorted(FallbackComponent, { boundaryId, store }, null, null, 1, null),
      1,
      null
    ),
  ] as unknown as JSXOutput;
};

/** @internal */
export const errorBoundaryCmp = (props: ErrorBoundaryProps): JSXOutput => {
  // The flag is build-time replaced, so when it is off ErrorBoundary can't work: fail loud instead of degrading.
  if (!__EXPERIMENTAL__.errorBoundary) {
    throw new Error(
      '<ErrorBoundary> requires the `errorBoundary` experimental feature. Enable it in your Qwik Vite config: qwikVite({ experimental: ["errorBoundary"] }).'
    );
  }
  const store = useErrorBoundaryStore();
  // Store mirrors for the server SSR-catch path; wrapped in fresh closures so `noSerialize` taints
  // the closure, not the shared prop QRL that must stay serialized for the client.
  const fallbackQrl = props.fallback$;
  store.$fallback$ = noSerialize((error: any) => fallbackQrl(error));
  const onErrorQrl = props.onError$;
  store.$onError$ = onErrorQrl ? noSerialize((error: unknown) => onErrorQrl(error)) : undefined;

  const isServerEnv = qTest ? isServerPlatform() : !isBrowser;
  if (__EXPERIMENTAL__.errorBoundary && isServerEnv && isOutOfOrderStreaming()) {
    // OOOS: the fallback-host carries `q:rp` and is revealed by the shared `qO` segment executor.
    // The hosts deliberately don't read `store.error` directly (only the styles' fn-signal does):
    // subscribing the component would re-render an already-streamed host on a late deferred throw.
    return buildErrorBoundaryHosts(store, QSuspenseResultParent, SSRErrorFallback);
  }

  // In-order SSR: same two-host swap, but the fallback-host emits inline right after the content-host so the swap needs no buffering.
  if (__EXPERIMENTAL__.errorBoundary && isServerEnv) {
    return buildErrorBoundaryHosts(store, QErrorFallbackHost, SSRErrorFallbackInline);
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
