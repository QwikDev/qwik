import { component$, useStore } from "@builder.io/qwik";

export const Counter = component$(() => {
  const store = useStore({ count: 0 });

  return (
    <button
      onClick$={() => store.count++}
    >
      Increment {store.count}
    </button>
  );
});
