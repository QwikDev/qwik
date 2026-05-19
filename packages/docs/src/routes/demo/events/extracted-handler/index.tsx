import { component$, useSignal, $ } from '@qwik.dev/core';

export default component$(() => {
  const count = useSignal(0);
  const increment = $(() => count.value++);
  return (
    <>
      <button onClick$={increment}>Increment</button>
      <p>Count: {count.value}</p>
    </>
  );
});
