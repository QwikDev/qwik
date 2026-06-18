import { useErrorBoundary } from '../../use/use-error-boundary';
import { componentQrl, type Component } from '../component.public';
import { _jsxSorted } from '../jsx/jsx-internal';
import { Fragment } from '../jsx/jsx-runtime';
import { Slot } from '../jsx/slot.public';
import type { JSXOutput } from '../jsx/types/jsx-node';
import { inlinedQrl } from '../qrl/qrl';
import type { QRL } from '../qrl/qrl.public';
import { noSerialize } from '../serdes/verify';

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
 * Errors are routed to the CLOSEST boundary by the container's `handleError` (it resolves
 * `ERROR_CONTEXT` and sets this store's `.error`); both synchronous render throws and async `qerror`
 * events go through it. During SSR the fallback is rendered in place via `store.$fallback$`. So this
 * component only reads its store and renders — there is no per-boundary `qerror` listener.
 */

/** @internal */
export const errorBoundaryCmp = (props: ErrorBoundaryProps): JSXOutput => {
  const store = useErrorBoundary();
  // Expose the fallback so SSR can render it in place when a child throws (the client re-renders this
  // component instead, which reads `store.error` below). Server-render-only, hence noSerialize.
  store.$fallback$ = noSerialize(props.fallback$);

  if (store.error) {
    return /*#__PURE__*/ _jsxSorted(Fragment, null, null, props.fallback$(store.error), 0, null);
  }

  return /*#__PURE__*/ _jsxSorted(Slot, null, null, null, 0, null);
};

/** @public */
export const ErrorBoundary: Component<ErrorBoundaryProps> =
  /*#__PURE__*/ componentQrl<ErrorBoundaryProps>(
    /*#__PURE__*/ inlinedQrl(errorBoundaryCmp, '_ebC')
  );
