import { component$, Catch } from '@qwik.dev/core';
import { CatchContent, CatchSyncThrower, resetFallback } from '../../components/catch/catch';

export default component$(() => (
  <Catch fallback$={resetFallback}>
    <CatchContent />
    <CatchSyncThrower />
  </Catch>
));
