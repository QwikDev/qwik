import { component$, isServer, useTask$ } from '@qwik.dev/core';

export default component$(() => {
  useTask$(() => {
    function foo() {
      if (isServer) {
        process.env;
      }
    }
    foo();
  });
  return <></>;
});
