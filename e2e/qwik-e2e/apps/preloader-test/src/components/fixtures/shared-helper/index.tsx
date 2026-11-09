import { component$, useSignal } from '@qwik.dev/core';
import { formatCount } from './card';

export default component$(() => {
  const label = useSignal('');
  return (
    <section class="fixture" data-fixture="shared-helper/shared-helper">
      <h2>shared helper</h2>
      <button data-testid="trigger" onClick$={() => (label.value = formatCount(1))}>
        Count
      </button>
      <output data-testid="result" data-done={label.value ? '' : undefined}>
        {label.value}
      </output>
    </section>
  );
});
