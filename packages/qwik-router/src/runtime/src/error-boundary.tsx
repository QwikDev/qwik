import { component$, useErrorBoundary, Slot, type QRL, useOnWindow, $ } from '@qwik.dev/core';

/** @public */
export interface ErrorBoundaryProps {
  fallback$?: QRL<(error: any) => any>;
}

/** @public */
export const ErrorBoundary = component$((props: ErrorBoundaryProps) => {
  const store = useErrorBoundary();

  useOnWindow(
    'qerror',
    $((e: CustomEvent) => {
      // we are allowed to write to our "read-only" store
      (store.error as any) = e.detail.error;
    })
  );

  if (store.error && props.fallback$) {
    return <>{props.fallback$(store.error)}</>;
  }

  return <Slot />;
});
