import { component$, useTask$, useAsyncComputed$ } from '@qwik.dev/core';

export default component$(() => {
  const async1 = useAsyncComputed$(() => Promise.resolve(1));

  useTask$(async () => {
    await async1.promise();
    const x = 1;
    async1.value;
  });

  return <div />;
});
