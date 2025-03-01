import { component$, useErrorBoundary, Slot, type QRL, useOnWindow, $ } from '@builder.io/qwik';

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
      store.error = e.detail.error;
    })
  );

  if (store.error && props.fallback$) {
    return <>{props.fallback$(store.error)}</>;
  }

  return <Slot />;
});
