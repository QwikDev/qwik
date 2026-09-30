import { component$, Catch, useSignal } from '@qwik.dev/core';
import { CatchSyncThrower, outerFallback, resetFallback } from '../../components/catch/catch';

export default component$(() => {
  const touched = useSignal(0);
  return (
    <Catch fallback$={outerFallback}>
      <section id="catch-outer-ok">
        <p>outer ok</p>
        <button id="catch-outer-ok-button" onClick$={() => touched.value++}>
          Touch outer
        </button>
        <span id="catch-outer-ok-count">{touched.value}</span>
      </section>
      <Catch fallback$={resetFallback}>
        <CatchSyncThrower />
      </Catch>
    </Catch>
  );
});
