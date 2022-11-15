import { component$, useStore, $ } from '@builder.io/qwik';

export default component$(() => {
  const store = useStore({ name: '' });
  return (
    <>
      Enter your name followed by the enter key:{' '}
      <input
        onInput$={(event) => {
          const input = event.target as HTMLInputElement;
          store.name = input.value;
        }}
        onChange$={(_) => {
          if (store.name) alert(store.name);
        }}
        value={store.name}
      />
    </>
  );
});
