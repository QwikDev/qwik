import { component$, ErrorBoundary, useComputed$ } from '@qwik.dev/core';
import { defaultFallback } from '../../components/error-boundary/error-boundary';

const AsyncErrorInline = component$(() => {
  const data = useComputed$(async () => {
    throw new Error('expected-async-error');
  });
  if (data.pending) {
    return <span id="async-loading">loading</span>;
  }
  return <div id="async-error">handled: {(data.error as Error)?.message ?? 'none'}</div>;
});

export default component$(() => (
  <ErrorBoundary fallback$={defaultFallback}>
    <AsyncErrorInline />
  </ErrorBoundary>
));
