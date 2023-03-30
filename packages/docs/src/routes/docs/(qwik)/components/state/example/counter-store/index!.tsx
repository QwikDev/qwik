import { component$, useStore } from '@builder.io/qwik';

export default component$(() => {
  const state = useStore({ count: 0 });

  return (
    <>
      <button onClick$={() => state.count++}>Increment</button>
      <div>Count: {state.count}</div>
    </>
  );
});
