import { component$, useStore, $ } from '@builder.io/qwik';

export const App = component$(() => {
  const store = useStore({ name: '' });
  return (
    <>
      Enter your name followed by the enter key:{' '}
      <input
        onInput$={$(async (event: KeyboardEvent) => {
          const input = event.target as HTMLInputElement;
          store.name = input.value;
        })}
        onChange$={$(async (event: KeyboardEvent) => {
          if (store.name) alert(store.name);
        })}
        value={store.name}
      />
    </>
  );
});
