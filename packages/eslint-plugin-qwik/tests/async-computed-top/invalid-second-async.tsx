import { component$, useTask$, useAsyncComputed$ } from '@qwik.dev/core';

export default component$(() => {
  const async1 = useAsyncComputed$(() => Promise.resolve(1));
  const async2 = useAsyncComputed$(() => Promise.resolve(2));

  useTask$(() => {
    async1.value;
    // Expect error: {"messageId":"asyncComputedNotTop"}
    async2.value;
    const x = 1;
  });

  return <div />;
});
