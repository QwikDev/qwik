import { component$, useSignal } from '@qwik.dev/core';

// A fire-and-forget Promise.reject must reach logError via the unhandledrejection bridge.
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
