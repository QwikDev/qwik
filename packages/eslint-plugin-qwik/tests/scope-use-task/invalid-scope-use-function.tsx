// Expect error: { "messageId": "unsafeApiUsage" }
// Expect error: { "messageId": "unsafeApiUsage" }
// Expect error: { "messageId": "unsafeApiUsageInCalledFunction" }
// Expect error: { "messageId": "unsafeApiUsageInCalledFunction" }

import { component$, useTask$ } from '@qwik.dev/core';
export default component$(() => {
  function child_process() {}
  useTask$(() => {
    function foo() {
      process.env;
    }
    const foo2 = () => {
      process.env;
    };
    child_process();
    foo();
    foo2();
  });
  return <></>;
});
