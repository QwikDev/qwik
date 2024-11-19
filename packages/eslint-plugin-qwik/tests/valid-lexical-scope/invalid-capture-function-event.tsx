// Expect error: { "messageId": "invalidJsxDollar" }
import { component$, useTask$ } from '@builder.io/qwik';
export const HelloWorld = component$(() => {
  /* eslint no-console: [, { allow: ["log"] }] */
  const click = () => console.log();
  return <button onClick$={click}></button>;
});
