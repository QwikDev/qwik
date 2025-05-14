// Expect error: { "messageId": "unsafeApiUsage" }
// Expect error: { "messageId": "unsafeApiUsageInCalledFunction" }

import { component$, useTask$ } from '@qwik.dev/core';

export default component$(() => {
  useTask$(() => {
    function foo() {
      process.env;
    }
    foo();
  });
  return <></>;
});
