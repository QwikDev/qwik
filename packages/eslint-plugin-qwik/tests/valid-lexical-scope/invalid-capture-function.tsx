// Expect error: { "messageId": "referencesOutside" }
import { component$, useTask$ } from '@builder.io/qwik';
export const HelloWorld = component$(() => {
  function getValue() {
    if (Math.random() < 0.5) {
      return 'string';
    } else {
      return () => {
        // eslint-disable-next-line no-console
        console.log();
      };
    }
  }
  const a = getValue();
  useTask$(() => {
    // eslint-disable-next-line no-console
    console.log(a);
  });
  return <div></div>;
});
