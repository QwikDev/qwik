import { component$, useSignal } from '@qwik.dev/core';

/** Never renders again on the client, so nothing but the translation holds its static text. */
export const Root = component$(() => {
  const count = useSignal(5);
  return (
    <div id="translated">
      <button id="count" onClick$={() => count.value++}>
        Count
      </button>
      <p id="sentence">You have clicked the button {count.value} times so far.</p>
    </div>
  );
});
