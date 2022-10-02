import { component$, useStore, $ } from '@builder.io/qwik';
import type { QwikKeyboardEvent } from 'packages/qwik/src/core/render/jsx/types/jsx-qwik-events';

export const App = component$(() => {
  const store = useStore({ name: '' });
  const onKeyUp$ = $(async (event: QwikKeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    if (event.key === 'Enter') {
      alert(store.name);
    } else {
      store.name = input.value;
    }
  });
  return (
    <>
      Enter your name followed by the enter key: <input onKeyUp$={onKeyUp$} value={store.name} />
    </>
  );
});
