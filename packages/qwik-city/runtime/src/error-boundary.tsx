import { component$, useErrorBoundary, Slot, PropFunction } from '@builder.io/qwik';

/**
 * @alpha
 */
export interface ErrorBoundaryProps {
  children: any;
  fallback$: PropFunction<(ev: any) => any>;
}

/**
 * @alpha
 */
export const ErrorBoundary = component$((props: ErrorBoundaryProps) => {
  const store = useErrorBoundary();

  return store.error === undefined ? <Slot /> : <>{props.fallback$(store.error)}</>;
});
