import { component$, Catch } from '@qwik.dev/core';
import { CatchSyncThrower, innerFallback, outerFallback } from '../../components/catch/catch';

export default component$(() => (
  <Catch fallback$={outerFallback}>
    <Catch fallback$={innerFallback}>
      <CatchSyncThrower />
    </Catch>
    <CatchSyncThrower />
  </Catch>
));
