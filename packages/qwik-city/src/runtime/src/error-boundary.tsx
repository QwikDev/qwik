import { component$, useErrorBoundary, Slot, type QRL } from '@qwikdev/core';

/** @public */
export interface ErrorBoundaryProps {
  children: any;
  fallback$: QRL<(ev: any) => any>;
}

/** @public */
export const ErrorBoundary = component$((props: ErrorBoundaryProps) => {
  const store = useErrorBoundary();

  return store.error === undefined ? <Slot /> : <>{props.fallback$(store.error)}</>;
});
