import { component$, useErrorBoundary, Slot, type PropFunction } from '@builder.io/qwik';

/**
 * @public
 */
export interface ErrorBoundaryProps {
  children: any;
  fallback$: PropFunction<(ev: any) => any>;
}

/**
 * @public
 */
export const ErrorBoundary = component$((props: ErrorBoundaryProps) => {
  const store = useErrorBoundary();

  return store.error === undefined ? <Slot /> : <>{props.fallback$(store.error)}</>;
});
