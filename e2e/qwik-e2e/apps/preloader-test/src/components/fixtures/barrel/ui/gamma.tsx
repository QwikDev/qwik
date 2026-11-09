import { component$, useSignal } from '@qwik.dev/core';
import { formatGamma } from './gamma-format';

export const Gamma = component$(() => {
  const value = useSignal(1);
  return (
    <div class="barrel-item">
      <output data-testid="result" data-done="">
        {formatGamma(value.value)}
      </output>
      <button onClick$={() => value.value++}>More</button>
    </div>
  );
});
