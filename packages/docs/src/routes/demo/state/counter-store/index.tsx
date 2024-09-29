import { component$, useStore } from '@qwik.dev/core';

export default component$(() => {
  const state = useStore({ count: 0, name: 'Qwik' });

  return (
    <>
      <button onClick$={() => state.count++}>Increment</button>
      <p>Count: {state.count}</p>
      <input
        value={state.name}
        onInput$={(_, el) => (state.name = el.value)}
      />
    </>
  );
});
