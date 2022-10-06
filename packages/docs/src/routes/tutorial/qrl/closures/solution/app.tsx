import { component$, useStore, $ } from '@builder.io/qwik';

export const App = component$(() => {
  const store = useStore({ name: '' });
  // This fires on every change of the input value
  const onInput$ = $(async (event: KeyboardEvent) => {
    const input = event.target as HTMLInputElement;
    store.name = input.value;
  });
  // This fires on confirmations like Enter or focus change
  const onChange$ = $(async (event: KeyboardEvent) => {
    if (store.name) alert(store.name);
  });
  return (
    <>
      Enter your name followed by the enter key:{' '}
      <input onInput$={onInput$} onChange$={onChange$} value={store.name} />
    </>
  );
});
