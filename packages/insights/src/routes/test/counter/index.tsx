import { component$, useSignal } from '@builder.io/qwik';

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
