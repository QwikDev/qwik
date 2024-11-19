// Expect error: { "messageId": "referencesOutside" }
import { component$, useTask$ } from '@builder.io/qwik';

export const HelloWorld = component$(() => {
  function useMethod() {
    /* eslint no-console: [, { allow: ["log"] }] */
    console.log('stuff');
  }
  useTask$(() => {
    /* eslint no-console: [, { allow: ["log"] }] */
    console.log(useMethod);
  });
  return <div></div>;
});
