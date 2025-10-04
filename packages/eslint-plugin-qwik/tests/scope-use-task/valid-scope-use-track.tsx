import { component$, useSignal, useTask$, isServer } from '@qwik.dev/core';

export default component$(() => {
  const s = useSignal(0);
  useTask$(({ track }) => {
    if (isServer) {
      process.env;
    }
    track(() => {
      if (isServer) {
        process.env;
      }
      return s.value;
    });
  });
  return <></>;
});
