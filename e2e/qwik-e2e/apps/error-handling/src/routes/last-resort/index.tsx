import { component$, Catch } from '@qwik.dev/core';
import { defaultFallback, CatchThrowOnClick } from '../../components/catch/catch';

export default component$(() => (
  <Catch fallback$={defaultFallback}>
    <CatchThrowOnClick idPrefix="catch-last-resort" message="last-resort boom" />
    <div id="catch-content">content ok</div>
  </Catch>
));
