import { component$, ErrorBoundary, Suspense, useAsync$ } from '@qwik.dev/core';
// Relative (not `~`) so the prod twin can re-export this module across app roots.
import { defaultFallback } from '../../components/error-boundary/error-boundary';

// Reading `.value` re-throws the async error → caught by the <ErrorBoundary>.
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
