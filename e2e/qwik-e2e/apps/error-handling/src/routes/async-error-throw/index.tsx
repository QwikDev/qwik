import { component$, ErrorBoundary, Suspense, useAsync$ } from '@qwik.dev/core';
import { defaultFallback } from '../../components/error-boundary/error-boundary';

const AsyncValueThrows = component$(() => {
  const data = useAsync$(async () => {
    throw new Error('unexpected-async-error');
  });
  return <div id="async-value">{String(data.value)}</div>;
});

export default component$(() => (
  <ErrorBoundary fallback$={defaultFallback}>
    <Suspense fallback={<span id="async-loading">loading</span>}>
      <AsyncValueThrows />
    </Suspense>
  </ErrorBoundary>
));
