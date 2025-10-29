// Expect error: { "messageId": "unsafeApiUsage" }
// Expect error: { "messageId": "unsafeApiUsage" }
// Expect error: { "messageId": "unsafeApiUsageInCalledFunction" }
// Expect error: { "messageId": "unsafeApiUsageInCalledFunction" }

import { component$, useTask$ } from '@qwik.dev/core';
export default component$(() => {
  useTask$(() => {
    function foo() {
      process.env;
    }
    const foo2 = () => {
      process.env;
    };
    foo();
    foo2();
  });
  return <></>;
});
