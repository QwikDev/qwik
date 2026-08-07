import { useComputed$, useSignal, useTask$ } from '@qwik.dev/core';

export function App() {
  const count = useSignal(2);
  const label = useSignal('idle');
  const doubled = useComputed$(() => count.value * 2);
  useTask$(() => {
    if (count.value === 2) {
      label.value = 'ready';
    }
  });
  return (
    <p title={label.value}>
      <output>{doubled.value}</output>
    </p>
  );
}
