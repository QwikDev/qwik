import { component$ } from '@builder.io/qwik';

export const App = component$(() => {
  return <my-app>Host element tag-name: {'print current document.location here'}</my-app>;
});
