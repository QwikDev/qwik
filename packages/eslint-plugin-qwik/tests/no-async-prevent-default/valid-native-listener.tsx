import { $, useTask$ } from '@builder.io/qwik';

export const ValidNativeListener = () => {
  useTask$(() => {
    window.addEventListener('keydown', (event) => event.preventDefault());
  });
  const open$ = $(() => {
    document.addEventListener('click', (event) => event.stopPropagation(), { once: true });
  });
  return <button onClick$={open$}>Hello World</button>;
};
