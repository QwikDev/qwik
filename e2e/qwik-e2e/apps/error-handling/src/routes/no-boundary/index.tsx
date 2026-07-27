import { component$, useSignal } from '@qwik.dev/core';

// No ErrorBoundary: a client throw must surface to the global handler.
export default component$(() => {
  const touched = useSignal(0);
  return (
    <>
      <button
        id="eb-no-boundary-throw"
        onClick$={() => {
          touched.value++;
          throw new Error('no-boundary boom');
        }}
      >
        throw on click
      </button>
      <span id="eb-no-boundary-touched">{touched.value}</span>
    </>
  );
});
