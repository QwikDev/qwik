import { component$, Catch } from '@qwik.dev/core';
import { CatchContent, CatchSyncThrower, outerFallback } from '../../components/catch/catch';

export default component$(() => (
  <Catch fallback$={outerFallback}>
    <Catch
      fallback$={() => {
        throw new Error('inner fallback boom');
      }}
    >
      <CatchContent />
      <CatchSyncThrower />
    </Catch>
  </Catch>
));
