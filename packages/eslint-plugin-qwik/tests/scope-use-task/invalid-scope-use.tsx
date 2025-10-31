// Expect error: { "messageId": "unsafeApiUsage" }
// Expect error: { "messageId": "unsafeApiUsage" }
import { component$, isServer, useTask$ } from '@qwik.dev/core';

export default component$(() => {
  useTask$(() => {
    process.env;
    if (!isServer) {
      process.env;
    }
  });
  return <></>;
});
