import { component$, useTask$, useAsync$ } from '@qwik.dev/core';

export default component$(() => {
  const async1 = useAsync$(() => Promise.resolve(1));

  useTask$(async () => {
    await async1.promise();
    const x = 1;
    async1.value;
  });

  return <div />;
});
