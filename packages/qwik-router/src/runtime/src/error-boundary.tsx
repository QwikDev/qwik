import { component$, useErrorBoundary, Slot, noSerialize, type QRL } from '@qwik.dev/core';

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
  // Expose the fallback so SSR can render it in place when a child throws during server render
  // (on the client the boundary simply re-renders and takes the branch below). Server-render-only,
  // so noSerialize — it must not end up in the serialized state.
  store.$fallback$ = noSerialize(props.fallback$);

  if (store.error && props.fallback$) {
    return <>{props.fallback$(store.error)}</>;
  }

  return <Slot />;
});
