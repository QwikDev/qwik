import { component$, useComputed$ } from '@qwik.dev/core';

export default component$(() => {
  const async1 = useComputed$(async () => 1);

  function notQrl() {
    const x = 1;
    async1.value;
  }

  notQrl();
  return <div />;
});
