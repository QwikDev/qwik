import { component$ } from '@qwik.dev/core';

export default component$(() => {
  const captured = {
    secret: 'PRIVATE_CAPTURE_STATE',
    get value(): number {
      throw new Error('PRIVATE_CAPTURE_ERROR');
    },
  };
  return (
    <button id="failed-capture" onClick$={() => captured.value}>
      capture
    </button>
  );
});
