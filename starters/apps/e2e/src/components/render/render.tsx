import { component$, $, useStore, Host } from '@builder.io/qwik';

export const Render = component$(() => {
  const state = useStore({
    count: 0,
  });
  return $(() => {
    if (state.count === 3) {
      return null;
    }
    return (
      <Host>
        <button
          on$:click={() => {
            state.count++;
          }}
        >
          Rerender {state.count}
        </button>
      </Host>
    );
  });
});
