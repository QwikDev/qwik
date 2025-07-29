// Expect error: { "messageId": "noUseVisibleTask" }

import { component$, useVisibleTask$ } from '@qwik.dev/core';
export default component$(() => {
  useVisibleTask$(() => {});
  return <></>;
});
