// Expect error: { "messageId": "unsafeApiUsage" }

import { component$, useTask$ } from '@qwik.dev/core';

export default component$(() => {
  useTask$(() => {
    process.env;
  });
  return <></>;
});
