import { component$, useSignal } from '@qwik.dev/core';
import { server$ } from '@qwik.dev/router';

const doubleCount = server$(async function (input: { count: number }) {
  return input.count * 2;
});

export default component$(() => {
  const result = useSignal<number>();
  return (
    <button
      id="server-call-button"
      onClick$={async () => {
        result.value = await doubleCount({ count: 21 });
      }}
    >
      Result: {result.value}
    </button>
  );
});
