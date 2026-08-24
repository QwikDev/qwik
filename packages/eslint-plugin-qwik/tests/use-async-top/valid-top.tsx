import { component$, useTask$, useComputed$ } from '@qwik.dev/core';

export default component$(() => {
  const a = useComputed$(async () => 1);
  const b = useComputed$(() => 2);

  useTask$(() => {
    a.value;
    b.value;
    const x = 1;
  });

  return <div>{a.value}</div>;
});
