// Expect error: { "messageId": "referencesOutside" }
import { component$, useTask$ } from '@builder.io/qwik';
export const HelloWorld = component$(() => {
  function getValue() {
    if (Math.random() < 0.5) {
      return 'string';
    } else {
      return () => {
        /* eslint no-console: [, { allow: ["log"] }] */
        console.log();
      };
    }
  }
  const a = getValue();
  useTask$(() => {
    /* eslint no-console: [, { allow: ["log"] }] */
    console.log(a);
  });
  return <div></div>;
});
