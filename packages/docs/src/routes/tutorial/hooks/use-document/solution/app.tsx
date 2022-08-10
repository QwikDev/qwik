import { component$, useDocument } from '@builder.io/qwik';

export const App = component$(() => {
  const doc = useDocument();
  return <my-app>Host element tag-name: {doc.location.toString()}</my-app>;
});
