// Expect error: { "messageId": "mutableIdentifier" }
import { component$ } from '@qwik.dev/core';
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
