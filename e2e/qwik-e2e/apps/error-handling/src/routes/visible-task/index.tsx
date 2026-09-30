import { component$, Catch, useVisibleTask$ } from '@qwik.dev/core';
import { defaultFallback } from '../../components/catch/catch';

const VisibleTaskThrower = component$(() => {
  useVisibleTask$(() => {
    throw new Error('visible boom');
  });
  return <div id="catch-content">streamed content</div>;
});

export default component$(() => (
  <Catch fallback$={defaultFallback}>
    <VisibleTaskThrower />
  </Catch>
));
