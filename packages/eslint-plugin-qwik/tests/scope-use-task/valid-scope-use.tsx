// Expect error: { "messageId": "unsafeApiUsage" }

import { component$, useTask$, isServer } from '@qwik.dev/core';

export default component$(() => {
  useTask$(() => {
    if (isServer) {
      process.env;
    }
  });
  return <></>;
});
