import { component$, Catch } from '@qwik.dev/core';
import { defaultFallback, CatchContent, CatchSyncThrower } from '../../components/catch/catch';

export default component$(() => (
  <Catch fallback$={defaultFallback}>
    <CatchContent />
    <CatchSyncThrower />
  </Catch>
));
