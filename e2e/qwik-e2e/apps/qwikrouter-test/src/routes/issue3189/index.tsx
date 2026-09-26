import { $, component$, useSignal } from '@qwik.dev/core';
import { server$ } from '@qwik.dev/router';

export default component$(() => {
  const result = useSignal('pending');
  const name = 'world';
  const capitalize = $((value: string) => value[0].toUpperCase() + value.substring(1));

  return (
    <>
      <button
        id="issue-3189-button"
        onClick$={async () => {
          result.value = await server$(async () => `Hello ${await capitalize(name)}!`)();
        }}
      >
        Run
      </button>
      <output id="issue-3189-result">{result.value}</output>
    </>
  );
});
