import { _run } from '../../client/run-qrl';
import { useErrorBoundary } from '../../use/use-error-boundary';
import { useOnWindow } from '../../use/use-on';
import { componentQrl, type Component } from '../component.public';
import { _jsxSorted } from '../jsx/jsx-internal';
import { Fragment } from '../jsx/jsx-runtime';
import { Slot } from '../jsx/slot.public';
import type { JSXOutput } from '../jsx/types/jsx-node';
import { inlinedQrl } from '../qrl/qrl';
import { _captures, createQRL } from '../qrl/qrl-class';
import type { QRL } from '../qrl/qrl.public';
import type { ErrorBoundaryStore } from './error-handling';

/** @public */
export interface ErrorBoundaryProps {
  fallback$?: QRL<(error: any) => any>;
}

/*
 * ErrorBoundary lives in core (not the router) so it ships with the framework. Core is not run
 * through the Qwik optimizer, so we can't use `component$`/`$` here — the `$()` marker would survive
 * into the runtime and throw. Instead we build the QRLs by hand with `inlinedQrl` and export their
 * symbols from the core bundle (see `handlers.mjs` and qwik-vite's `manifest.ts`).
 */

/** @internal */
export const errorBoundaryQrl = (e: CustomEvent): void => {
  const store = _captures![0] as ErrorBoundaryStore;
  store.error = e.detail.error;
};

/** @internal */
export const errorBoundaryCmp = (props: ErrorBoundaryProps): JSXOutput => {
  const store = useErrorBoundary();

  // The optimizer normally wraps event handlers that have captures in `_run` (see `setEvent`), but
  // it skips `_`-prefixed core symbols, so we wrap our listener ourselves to get the same capture
  // and invoke-context handling as a regular handler.
  useOnWindow(
    'qerror',
    createQRL(null, '_run', _run, null, [
      /*#__PURE__*/ inlinedQrl(errorBoundaryQrl, '_ebL', [store]),
    ]) as unknown as QRL<(e: CustomEvent) => void>
  );

  if (store.error && props.fallback$) {
    return /*#__PURE__*/ _jsxSorted(Fragment, null, null, props.fallback$(store.error), 0, null);
  }

  return /*#__PURE__*/ _jsxSorted(Slot, null, null, null, 0, null);
};

/** @public */
export const ErrorBoundary: Component<ErrorBoundaryProps> =
  /*#__PURE__*/ componentQrl<ErrorBoundaryProps>(
    /*#__PURE__*/ inlinedQrl(errorBoundaryCmp, '_ebC')
  );
