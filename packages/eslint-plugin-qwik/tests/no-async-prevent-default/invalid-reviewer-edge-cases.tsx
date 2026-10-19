// Expect error: { "messageId": "noAsyncPreventDefault" }
// Expect error: { "messageId": "noAsyncPreventDefault" }
// Expect error: { "messageId": "noAsyncPreventDefault" }
// Expect error: { "messageId": "noAsyncPreventDefault" }
import { $, type QRL } from '@builder.io/qwik';

type Handler = QRL<(event: Event) => void>;

export const InvalidEdgeCases = () => {
  const iife$ = $((event: Event) => {
    (() => event.preventDefault())();
  });
  const cast$ = $(((event: Event) => event.preventDefault()) as (event: Event) => void) as Handler;
  return (
    <div
      onClick$={function listener(event: MouseEvent) {
        event.preventDefault();
      }}
      on-custom-event$={(event: Event) => event.preventDefault()}
    >
      <button onClick$={iife$} onFocus$={cast$}>
        Hello World
      </button>
    </div>
  );
};
