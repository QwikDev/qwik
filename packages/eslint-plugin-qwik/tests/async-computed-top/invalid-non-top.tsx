import { component$, useTask$, useAsyncComputed$, useComputed$ } from '@qwik.dev/core';

export default component$(() => {
  const async1 = useAsyncComputed$(() => Promise.resolve(1));
  const sync1 = useComputed$(() => 2);

  useTask$(() => {
    const x = 1;
    // Expect error: {"messageId":"asyncComputedNotTop"}
    async1.value;
    sync1.value;
  });

  return <div />;
});
