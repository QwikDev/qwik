// Expect error: { "messageId": "unsafeApiUsageInCalledFunction" }

import { component$, useTask$ } from '@qwik.dev/core';
function foo() {
  process.env;
}
export default component$(() => {
  useTask$(() => {
    foo();
  });
  return <></>;
});
