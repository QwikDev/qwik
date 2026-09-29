import { component$, Catch } from '@qwik.dev/core';
import { CatchThrowOnClick, innerFallback, outerFallback } from '../../components/catch/catch';

export default component$(() => (
  <Catch fallback$={outerFallback}>
    <div id="catch-outer-ok">outer ok</div>
    <Catch fallback$={innerFallback}>
      <CatchThrowOnClick idPrefix="catch-inner" message="inner client boom" />
      <div id="catch-content">content ok</div>
    </Catch>
  </Catch>
));
