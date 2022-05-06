import { component$ } from '@builder.io/qwik';
import { useStore } from 'packages/qwik/dist/core';

export const App = component$(() => {
  const store = useStore({ count: 0 });

  return (
    <div>
      <p>Count: {store.count}</p>
      <p>
        <button onClick$={() => store.count++}>Click</button>
      </p>
    </div>
  );
});
