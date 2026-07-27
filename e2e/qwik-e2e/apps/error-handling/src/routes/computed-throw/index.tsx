import { component$, ErrorBoundary, isServer, useComputed$ } from '@qwik.dev/core';
import { defaultFallback } from '../../components/error-boundary/error-boundary';

// Reading a computed that throws routes the error to the boundary.
const EbComputedThrower = component$(() => {
  const boom = useComputed$((): string => {
    if (isServer) {
      throw new Error('computed boom');
    }
    return 'ok';
  });
  return <p id="eb-computed">{boom.value}</p>;
});

export default component$(() => (
  <ErrorBoundary fallback$={defaultFallback}>
    <EbComputedThrower />
  </ErrorBoundary>
));
