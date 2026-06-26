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
import { tryGetInvokeContext } from '../../use/use-core';
import { useLexicalScope } from '../../use/use-lexical-scope.public';
import type { ErrorBoundaryStore } from './error-handling';

/** @public */
export interface ErrorBoundaryProps {
  /**
   * Rendered when a descendant throws; receives `(error, reset)`. Add a live region for
   * screen-reader announcement.
   */
  fallback$: QRL<(error: any, reset: QRL<() => void>) => any>;
  /** Side-effect fired once per caught error; never affects rendering. */
  onError$?: QRL<(error: unknown) => void>;
}

/**
 * `reset` handler: clears the error and re-attempts the boundary's children.
 *
 * @internal
 */
export const errorBoundaryReset = (): void => {
  // The render-time boundary host; the reset-time host is the streamed fallback's, which doesn't chain.
  const [host] = useLexicalScope<[unknown]>();
  const container = tryGetInvokeContext()?.$container$ as
    | { resetErrorBoundary?: (host: unknown) => void }
    | undefined;
  if (container?.resetErrorBoundary && host) {
    container.resetErrorBoundary(host);
  }
};

// Core isn't optimizer-processed, so ErrorBoundary is hand-built with `inlinedQrl`.

// `!== undefined`, not truthiness, so a thrown falsy value still shows the fallback.
const _ebContentStyle = (store: ErrorBoundaryStore) => ({
  display: store.error !== undefined ? 'none' : 'contents',
});
const _ebContentStyle_str = '{display:p0.error!==undefined?"none":"contents"}';
const _ebFallbackStyle = (store: ErrorBoundaryStore) => ({
  display: store.error !== undefined ? 'contents' : 'none',
});
const _ebFallbackStyle_str = '{display:p0.error!==undefined?"contents":"none"}';

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
  if (!__EXPERIMENTAL__.errorBoundary) {
    throw new Error(
      '<ErrorBoundary> requires the `errorBoundary` experimental feature. Enable it in your Qwik Vite config: qwikVite({ experimental: ["errorBoundary"] }).'
    );
  }
  const store = useErrorBoundaryStore();
  // Capture the boundary host so a streamed fallback's `reset()` can re-find the boundary.
  const host = tryGetInvokeContext()?.$hostElement$;
  const reset = /*#__PURE__*/ inlinedQrl(errorBoundaryReset, '_ebR', [host]);
  // Server-only mirrors in fresh closures, so `noSerialize` taints them, not the serialized prop QRLs.
  const fallbackQrl = props.fallback$;
  store.$fallback$ = noSerialize((error: any) => fallbackQrl(error, reset));
  const onErrorQrl = props.onError$;
  store.$onError$ = onErrorQrl ? noSerialize((error: unknown) => onErrorQrl(error)) : undefined;

  const isServerEnv = qTest ? isServerPlatform() : !isBrowser;
  if (__EXPERIMENTAL__.errorBoundary && isServerEnv) {
    // Serialize the projection owner so a resumed `reset()` can re-render it (else unreachable).
    store.$resetOwner$ = (host as { parentComponent?: unknown } | undefined)?.parentComponent;
    // Out-of-order: fallback streams as a segment, revealed by `qO`.
    if (isOutOfOrderStreaming()) {
      return buildErrorBoundaryHosts(store, QSuspenseResultParent, SSRErrorFallback);
    }
    // In-order: fallback emitted inline, swapped by `qErr`.
    return buildErrorBoundaryHosts(store, QErrorFallbackHost, SSRErrorFallbackInline);
  }

  if (store.error !== undefined) {
    return /*#__PURE__*/ _jsxSorted(
      Fragment,
      null,
      null,
      props.fallback$(store.error, reset),
      0,
      null
    );
  }

  return /*#__PURE__*/ _jsxSorted(Slot, null, null, null, 0, null);
};

/** @public */
export const ErrorBoundary: Component<ErrorBoundaryProps> =
  /*#__PURE__*/ componentQrl<ErrorBoundaryProps>(
    /*#__PURE__*/ inlinedQrl(errorBoundaryCmp, '_ebC')
  );
