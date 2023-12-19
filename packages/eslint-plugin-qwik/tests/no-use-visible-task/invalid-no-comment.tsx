// Expect error: { "messageId": "noUseVisibleTask" }

import { component$, useVisibleTask$ } from '@builder.io/qwik';
export default component$(() => {
  useVisibleTask$(() => {});
  return <></>;
});
