import { $, component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const count = useSignal(0);
  return (
    <button type="button" onClick$={$(() => count.value++)}>
      count: {count.value}
    </button>
  );
});
