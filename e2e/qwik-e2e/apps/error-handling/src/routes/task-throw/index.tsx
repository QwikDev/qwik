import { component$, ErrorBoundary, isServer, useTask$ } from '@qwik.dev/core';
import { defaultFallback } from '../../components/error-boundary/error-boundary';

const EbTaskThrower = component$(() => {
  useTask$(() => {
    if (isServer) {
      throw new Error('task boom');
    }
  });
  return <span id="eb-task-content">task content</span>;
});

export default component$(() => (
  <ErrorBoundary fallback$={defaultFallback}>
    <EbTaskThrower />
  </ErrorBoundary>
));
