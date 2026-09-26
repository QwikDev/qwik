import { $, component$, Catch, isServer } from '@qwik.dev/core';
import { CatchAlwaysThrower, resetFallback } from '../../components/catch/catch';

export default component$(() => (
  <Catch
    fallback$={resetFallback}
    onError$={$(() => {
      if (!isServer) {
        (window as any).__catchRederiveRuns = ((window as any).__catchRederiveRuns ?? 0) + 1;
      }
    })}
  >
    <CatchAlwaysThrower />
  </Catch>
));
