import { component$, useTask$, useComputed$ } from '@qwik.dev/core';

export default component$(() => {
  const async1 = useComputed$(async () => 1);
  const async2 = useComputed$(async () => 2);

  useTask$(() => {
    async1.value;
    // Expect error: {"messageId":"asyncComputedNotTop"}
    async2.value;
    const x = 1;
  });

  return <div />;
});
