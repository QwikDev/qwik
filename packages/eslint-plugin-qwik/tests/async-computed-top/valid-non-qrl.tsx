import { component$, useAsyncComputed$ } from '@qwik.dev/core';

export default component$(() => {
  const async1 = useAsyncComputed$(() => Promise.resolve(1));

  function notQrl() {
    const x = 1;
    async1.value;
  }

  notQrl();
  return <div />;
});
