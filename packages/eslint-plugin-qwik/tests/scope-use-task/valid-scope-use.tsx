import { component$, useTask$, isServer } from '@qwik.dev/core';

export default component$(() => {
  process.env;
  useTask$(() => {
    if (isServer) {
      process.env;
    }
  });
  return <></>;
});
