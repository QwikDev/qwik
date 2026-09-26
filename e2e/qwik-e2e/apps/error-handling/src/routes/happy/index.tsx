import { component$, Catch } from '@qwik.dev/core';
import { defaultFallback, CatchContent, CatchThrowOnClick } from '../../components/catch/catch';

export default component$(() => (
  <Catch fallback$={defaultFallback}>
    <CatchContent />
    <CatchThrowOnClick idPrefix="catch-content" message="happy click boom" />
  </Catch>
));
