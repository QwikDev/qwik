// Expect error: { "messageId": "referencesOutside" }
import { component$, useTask$ } from '@builder.io/qwik';

export const HelloWorld = component$(() => {
  function useMethod() {
    console.log('stuff');
  }
  useTask$(() => {
    console.log(useMethod);
  });
  return <div></div>;
});
