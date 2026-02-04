import { component$, useTask$, useAsync$, useComputed$ } from '@qwik.dev/core';

export default component$(() => {
  const async1 = useAsync$(() => Promise.resolve(1));
  const sync1 = useComputed$(() => 2);

  useTask$(() => {
    async1.value;
    sync1.value;
    const x = 1;
  });

  return <div />;
});
