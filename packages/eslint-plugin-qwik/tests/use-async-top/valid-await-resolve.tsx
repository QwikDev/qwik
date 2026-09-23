import { component$, useTask$, useComputed$ } from '@qwik.dev/core';

export default component$(() => {
  const async1 = useComputed$(async () => 1);

  useTask$(async () => {
    await async1.promise();
    const x = 1;
    async1.value;
  });

  return <div />;
});
