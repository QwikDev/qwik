// Expect error: { "messageId": "mutableIdentifier" }
// Expect error: { "messageId": "mutableIdentifier" }
// Expect error: { "messageId": "mutableIdentifier" }
// Expect error: { "messageId": "mutableIdentifier" }
// Expect error: { "messageId": "mutableIdentifier" }
import { component$ } from '@qwik.dev/core';

export const Counter = component$(() => {
  let count = 0;
  return (
    <button
      onClick$={() => {
        count++;
        --count;
        ({ count } = { count: 1 });
        for (count of [1]) {
        }
        for (count in {}) {
        }
      }}
    >
      increment
    </button>
  );
});
