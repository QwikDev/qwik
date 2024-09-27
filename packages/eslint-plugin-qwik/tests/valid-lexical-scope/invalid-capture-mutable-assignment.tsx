// Expect error: { "messageId": "mutableIdentifier" }
import { component$ } from '@qwikdev/core';
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
