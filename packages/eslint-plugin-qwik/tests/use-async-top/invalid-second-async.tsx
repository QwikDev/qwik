import { component$, useTask$, useAsync$ } from '@qwik.dev/core';

export default component$(() => {
  const async1 = useAsync$(() => Promise.resolve(1));
  const async2 = useAsync$(() => Promise.resolve(2));

  useTask$(() => {
    async1.value;
    // Expect error: {"messageId":"asyncComputedNotTop"}
    async2.value;
    const x = 1;
  });

  return <div />;
});
