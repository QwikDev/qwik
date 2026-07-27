import { component$, ErrorBoundary } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
// Relative (not `~`) so the prod twin can re-export this module across app roots.
import { resetFallback } from '../../components/error-boundary/error-boundary';

export const useThrowingLoaderData = routeLoader$(() => ({
  shouldThrow: true,
  secret: 'loader-data-secret',
}));

// Throwing from the serialized loader value: reset re-runs the child, which re-derives the
// identical error from the round-tripped loader data (redacted in prod).
const LoaderDataThrower = component$(() => {
  const data = useThrowingLoaderData();
  if (data.value.shouldThrow) {
    throw new Error('loader data boom: ' + data.value.secret);
  }
  return <div id="eb-content">content ok</div>;
});

export default component$(() => (
  <ErrorBoundary fallback$={resetFallback}>
    <LoaderDataThrower />
  </ErrorBoundary>
));
