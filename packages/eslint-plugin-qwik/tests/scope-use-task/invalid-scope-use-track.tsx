// Expect error: { "messageId": "unsafeApiUsage" }
// Expect error: { "messageId": "unsafeApiUsage" }
// Expect error: { "messageId": "unsafeApiUsage" }
// Expect error: { "messageId": "unsafeApiUsage" }
import { component$, isBrowser, useSignal, useTask$ } from '@qwik.dev/core';

export default component$(() => {
  const s = useSignal(0);
  useTask$(({ track }) => {
    track(() => {
      if (isBrowser) {
        process.env;
        const m = process;
      }
      process.env;
      const m = process;
      return s.value;
    });
  });
  return <></>;
});
