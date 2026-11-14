import { component$, useSignal } from '@qwik.dev/core';
import { First } from './first';
import { Second } from './second';

export default component$(() => {
  const input = useSignal(0);
  return (
    <section class="fixture" data-fixture="tasks/siblings">
      <h2>tasks in two siblings</h2>
      <button data-testid="trigger" onClick$={() => (input.value = 1)}>
        Run
      </button>
      <First input={input} />
      <Second input={input} />
    </section>
  );
});
