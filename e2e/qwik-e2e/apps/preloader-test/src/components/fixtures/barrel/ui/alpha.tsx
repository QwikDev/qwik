import { component$, useSignal } from '@qwik.dev/core';
import { formatAlpha } from './alpha-format';

export const Alpha = component$(() => {
  const value = useSignal(1);
  return (
    <div class="barrel-item">
      <output data-testid="result" data-done="">
        {formatAlpha(value.value)}
      </output>
      <button onClick$={() => value.value++}>More</button>
    </div>
  );
});
