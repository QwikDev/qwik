// Expect error: { "messageId": "unsafeApiUsage" }
// Expect error: { "messageId": "unsafeApiUsage" }
import { component$, useSignal, useTask$ } from '@qwik.dev/core';

export default component$(() => {
  const s = useSignal(0);
  useTask$(({ track }) => {
    track(() => {
      process.env;
      const m = process;
      return s.value;
    });
  });
  return <></>;
});
