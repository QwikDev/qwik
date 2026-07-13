import { component$, useConstant, useSignal } from '@builder.io/qwik';

export default component$(() => {
  // Computed once on the first render and never recomputed.
  const componentId = useConstant(() => Math.random().toString(36).slice(2, 8));
  const count = useSignal(0);

  return (
    <>
      <p>Component id: {componentId}</p>
      <p>Count: {count.value}</p>
      <button onClick$={() => count.value++}>Increment</button>
    </>
  );
});
