import { component$, Catch } from '@qwik.dev/core';
import {
  CatchSyncThrower,
  CatchThrowOnClick,
  innerFallback,
  outerFallback,
} from '../../components/catch/catch';

export default component$(() => (
  <Catch fallback$={outerFallback}>
    <CatchThrowOnClick idPrefix="catch-outer" message="outer click boom" label="trigger outer" />
    <Catch fallback$={innerFallback}>
      <CatchSyncThrower />
    </Catch>
  </Catch>
));
