import { $, component$, useSignal } from '@qwik.dev/core';
import { ActionButton } from './action-button';

export default component$(() => {
  const result = useSignal(0);
  return (
    <section class="fixture" data-fixture="qrl-prop">
      <h2>QRL prop</h2>
      <ActionButton onAction$={$(() => (result.value = 42))} />
      <output data-testid="result" data-done={result.value ? '' : undefined}>
        {result.value}
      </output>
    </section>
  );
});
