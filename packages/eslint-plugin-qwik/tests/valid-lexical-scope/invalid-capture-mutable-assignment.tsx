// Expect error: { "messageId": "mutableIdentifier" }
import { component$ } from '@builder.io/qwik';
export const HelloWorld = component$(() => {
  let click: string = '';
  return (
    <button
      onClick$={() => {
        click = '';
      }}
    ></button>
  );
});
