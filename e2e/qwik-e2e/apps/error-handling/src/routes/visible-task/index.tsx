import { component$, ErrorBoundary, useVisibleTask$ } from '@qwik.dev/core';
import { defaultFallback } from '../../components/error-boundary/error-boundary';

const VisibleTaskThrower = component$(() => {
  useVisibleTask$(() => {
    throw new Error('visible boom');
  });
  return <div id="eb-content">streamed content</div>;
});

export default component$(() => (
  <ErrorBoundary fallback$={defaultFallback}>
    <VisibleTaskThrower />
  </ErrorBoundary>
));
