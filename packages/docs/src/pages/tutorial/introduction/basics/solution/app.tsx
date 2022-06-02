import { component$, useStore } from '@builder.io/qwik';

export const App = component$(() => {
  const state = useStore({ count: 50 });
  return (
    <div>
      <div>Count: {state.count}</div>
      <button
        onClick$={() => {
          state.count++;
        }}
      >
        Solution
      </button>
    </div>
  );
});
