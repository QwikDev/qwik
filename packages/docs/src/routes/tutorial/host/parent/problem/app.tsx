import { component$, Slot, useStore } from '@builder.io/qwik';

export const App = component$(() => {
  const store = useStore({ count: 0 });
  return <MyButton>{store.count}</MyButton>;
});

export const MyButton = component$(() => {
  return (
    <button>
      <Slot />
    </button>
  );
});
