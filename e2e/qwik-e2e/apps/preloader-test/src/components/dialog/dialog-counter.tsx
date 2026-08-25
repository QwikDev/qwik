import { component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const count = useSignal(0);
  return (
    <>
      <button onClick$={() => count.value++}>Increment</button>
      <p>Dialog Count: {count.value}</p>
    </>
  );
});
