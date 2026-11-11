import { component$, useSignal } from '@qwik.dev/core';
import { formatBeta } from './beta-format';

export const Beta = component$(() => {
  const value = useSignal(1);
  return (
    <div class="barrel-item">
      <output data-testid="result" data-done="">
        {formatBeta(value.value)}
      </output>
      <button onClick$={() => value.value++}>More</button>
    </div>
  );
});
