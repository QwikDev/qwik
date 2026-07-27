import { component$, useSignal } from '@qwik.dev/core';

export default component$(() => {
  const touched = useSignal(0);
  return (
    <>
      <button
        id="eb-reject"
        onClick$={() => {
          touched.value++;
          Promise.reject(new Error('unhandled boom'));
        }}
      >
        fire-and-forget reject
      </button>
      <span id="eb-reject-touched">{touched.value}</span>
    </>
  );
});
