import { component$, useAsync$ } from '@qwik.dev/core';

export default component$(() => {
  const async1 = useAsync$(() => Promise.resolve(1));

  function notQrl() {
    const x = 1;
    async1.value;
  }

  notQrl();
  return <div />;
});
