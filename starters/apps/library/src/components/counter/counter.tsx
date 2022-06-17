import { component$, useStore } from '@builder.io/qwik';

export const Counter = component$(() => {
  const store = useStore({ count: 0 });

  return (
    <div>
      <p>Count: {store.count}</p>
      <p>
        <button onClick$={() => store.count++}>Increment</button>
      </p>
    </div>
  );
});
