import { component$, useSignal } from '@qwik.dev/core';
import { Stats } from './stats';

export default component$(() => {
  const count = useSignal(0);
  return (
    <>
      <section class="fixture" data-fixture="computeds/click-after-load">
        <h2>a click right after load</h2>
        <button data-testid="trigger" onClick$={() => count.value++}>
          Count
        </button>
        <output data-testid="result" data-done={count.value ? '' : undefined}>
          {count.value}
        </output>
      </section>
      <div class="spacer" />
      <Stats />
    </>
  );
});
