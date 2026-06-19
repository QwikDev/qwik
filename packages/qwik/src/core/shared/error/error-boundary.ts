import { isBrowser } from '@qwik.dev/core/build';
import { isOutOfOrderStreaming, nextErrorBoundaryId } from '../../control-flow/suspense-utils';
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
import { QSuspenseResultParent } from '../utils/markers';
import { qTest } from '../utils/qdev';
import type { ErrorBoundaryStore } from './error-handling';

/** @public */
export interface ErrorBoundaryProps {
  /**
   * Rendered in place of the subtree when a descendant throws during render. Lazily loaded — only
   * fetched once the subtree errors — and receives the caught error.
   */
  fallback$: QRL<(error: any) => any>;
}

/*
 * ErrorBoundary lives in core (not the router) so it ships with the framework. Core is not run
 * through the Qwik optimizer, so we can't use `component$`/`$` here — the `$()` marker would survive
 * into the runtime and throw. Instead we build the component QRL by hand with `inlinedQrl` and export
 * its symbol from the core bundle (see `handlers.mjs` and qwik-vite's `manifest.ts`).
 *
 * The store is created and provided on `ERROR_CONTEXT` by the internal `useErrorBoundaryStore` hook
 * (the old public `useErrorBoundary` was removed). Errors are routed to the CLOSEST boundary by the
 * container's `handleError` (it resolves `ERROR_CONTEXT` and sets this store's `.error`); both
 * synchronous render throws and async `qerror` events go through it.
 *
 * Streaming (experimental `errorBoundary` feature): the boundary NEVER blocks streaming. On SSR with
 * out-of-order streaming it renders its subtree inside a visible content host plus a hidden fallback
 * host. The content streams as usual; if the subtree throws, the boundary's `fallback$` is streamed
 * as an out-of-order segment and the shared `qO` executor hides the content host and reveals the
 * fallback host (an inline script, so the swap happens before the framework resumes). On the client
 * — a fresh render, or a re-render after a post-resume error — the boundary just swaps `<Slot>` for
 * the fallback reactively (see `store.error` below).
 */

const _ebContentStyle = (store: ErrorBoundaryStore) => ({
  display: store.error ? 'none' : 'contents',
});
const _ebContentStyle_str = '{display:p0.error?"none":"contents"}';
const _ebFallbackStyle = (store: ErrorBoundaryStore) => ({
  display: store.error ? 'contents' : 'none',
});
const _ebFallbackStyle_str = '{display:p0.error?"contents":"none"}';

/** @internal */
export const errorBoundaryCmp = (props: ErrorBoundaryProps): JSXOutput => {
  const store = useErrorBoundaryStore();
  // Expose the fallback so SSR can stream it when a child throws (the client re-renders this
  // component instead, which reads `store.error` below). Wrap in a fresh closure before
  // `noSerialize` — `noSerialize` taints the value's identity, and `props.fallback$` is the SAME QRL
  // object, so noSerializing it directly would also drop the serialized prop (it would resume as
  // `undefined`, and the client re-render would call `undefined(error)`).
  const fallbackQrl = props.fallback$;
  store.$fallback$ = noSerialize((error: any) => fallbackQrl(error));

  const isServerEnv = qTest ? isServerPlatform() : !isBrowser;
  if (__EXPERIMENTAL__.errorBoundary && isServerEnv && isOutOfOrderStreaming()) {
    const boundaryId = nextErrorBoundaryId();
    // SSR with out-of-order streaming: render the subtree inside a visible content host plus a hidden
    // fallback host. The content streams as usual; an SSR throw streams `fallback$` into the fallback
    // host and the `qO` executor swaps the two via inline style. This branch deliberately does NOT
    // read `store.error`, so the component is not subscribed to it on the server (a late deferred
    // throw sets `store.error` mid-stream, and re-rendering an already-streamed host is unsupported).
    // A CLIENT-time error instead re-renders this component into the `if (store.error)` branch below —
    // the container's `handleError` marks this host dirty (see DomContainer.handleError) since the
    // OOOS boundary never subscribed to `store.error`. The diff then drops the two-host structure (the
    // empty `q:r` placeholder host removes cleanly, see `hasOnlySuspensePlaceholder`) and renders
    // `fallback$` fresh.
    return [
      /*#__PURE__*/ _jsxSorted(
        'div',
        { style: /*#__PURE__*/ _fnSignal(_ebContentStyle, [store], _ebContentStyle_str) },
        null,
        /*#__PURE__*/ _jsxSorted(Slot, null, null, null, 0, null),
        1,
        null
      ),
      /*#__PURE__*/ _jsxSorted(
        'div',
        {
          [QSuspenseResultParent]: String(boundaryId),
          style: /*#__PURE__*/ _fnSignal(_ebFallbackStyle, [store], _ebFallbackStyle_str),
        },
        null,
        /*#__PURE__*/ _jsxSorted(SSRErrorFallback, { boundaryId, store }, null, null, 1, null),
        1,
        null
      ),
    ] as unknown as JSXOutput;
  }

  if (store.error) {
    // `fallback$` is a lazy QRL after resume; invoking it returns the JSX (or a promise the renderer
    // awaits). It is now serialized (see the closure note above), so it is defined here.
    return /*#__PURE__*/ _jsxSorted(Fragment, null, null, props.fallback$(store.error), 0, null);
  }

  return /*#__PURE__*/ _jsxSorted(Slot, null, null, null, 0, null);
};

/** @public */
export const ErrorBoundary: Component<ErrorBoundaryProps> =
  /*#__PURE__*/ componentQrl<ErrorBoundaryProps>(
    /*#__PURE__*/ inlinedQrl(errorBoundaryCmp, '_ebC')
  );
