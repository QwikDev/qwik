// Expect error: { "messageId": "invalidJsxDollar" }
import { component$, useTask$ } from '@qwik.dev/core';
export const HelloWorld = component$(() => {
  // eslint-disable-next-line no-console
  const click = () => console.log();
  return <button onClick$={click}></button>;
});
