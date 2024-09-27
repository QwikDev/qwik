// Expect error: { "messageId": "noUseVisibleTask" }

import { component$, useVisibleTask$ } from '@qwikdev/core';
export default component$(() => {
  useVisibleTask$(() => {});
  return <></>;
});
