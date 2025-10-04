import { component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const count = useSignal(0);
  return (
    <div>
      Count: {count.value}
      <button onClick$={() => count.value++}>+1</button>
      <button onClick$={() => count.value--}>-1</button>
    </div>
  );
});
