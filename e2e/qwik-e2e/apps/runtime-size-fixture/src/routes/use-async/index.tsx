import { component$, useAsync$ } from '@qwik.dev/core';

export default component$(() => {
  const value = useAsync$(async () => 42);
  return <p>async: {value.value}</p>;
});
