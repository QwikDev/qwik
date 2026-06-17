import { component$, useErrorBoundary, Slot, type QRL } from '@qwik.dev/core';

/** @public */
export interface ErrorBoundaryProps {
  fallback$?: QRL<(error: any) => any>;
}

/** @public */
export const ErrorBoundary = component$((props: ErrorBoundaryProps) => {
  // The store is provided as ERROR_CONTEXT by useErrorBoundary. Both synchronous render throws and
  // async errors (`qerror`) are routed by the container's handleError() to the CLOSEST boundary,
  // which sets this store — so this component only has to read it and render the fallback.
  const store = useErrorBoundary();

  if (store.error && props.fallback$) {
    return <>{props.fallback$(store.error)}</>;
  }

  return <Slot />;
});
