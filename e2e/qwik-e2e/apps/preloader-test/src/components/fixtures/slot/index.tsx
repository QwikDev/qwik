import { component$, useSignal } from '@qwik.dev/core';
import { Panel } from './panel';

export default component$(() => {
  const count = useSignal(0);
  return (
    <section class="fixture" data-fixture="slot">
      <h2>slot</h2>
      <Panel title="projected">
        <button data-testid="trigger" onClick$={() => count.value++}>
          Add
        </button>
        <output data-testid="result" data-done={count.value ? '' : undefined}>
          {count.value}
        </output>
      </Panel>
    </section>
  );
});
