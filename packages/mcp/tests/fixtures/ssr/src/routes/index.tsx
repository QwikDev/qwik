import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const count = useSignal(0);
  return (
    <button id="counter" onClick$={() => count.value++}>
      Count: {count.value}
    </button>
  );
});
