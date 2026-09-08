import { component$ } from '@qwik.dev/core';

export const Counter = component$(() => {
  const state = { count: 0 };
  let initial = 0;
  initial++;
  return (
    <button
      onClick$={() => {
        let count = initial;
        count++;
        state.count = count;
        state.count++;
      }}
    >
      increment
    </button>
  );
});
