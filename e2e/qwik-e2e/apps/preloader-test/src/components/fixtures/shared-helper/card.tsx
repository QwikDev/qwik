import { component$, useSignal } from '@qwik.dev/core';
import { drawSparkline } from './sparkline';

export const formatCount = (count: number) => `${count} clicks`;

export const Card = component$(() => {
  const count = useSignal(0);
  return (
    <div class="card">
      <p>{formatCount(count.value)}</p>
      <pre>{drawSparkline([count.value, 3, 1, 4, 1, 5])}</pre>
      <button onClick$={() => count.value++}>Add</button>
    </div>
  );
});
