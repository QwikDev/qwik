import { component$, useSignal } from '@qwik.dev/core';

export const ModalBody = component$(() => {
  const isConfirmed = useSignal(false);
  return (
    <>
      <output data-testid="result" data-done="">
        ready
      </output>
      <button data-testid="confirm" onClick$={() => (isConfirmed.value = true)}>
        Confirm
      </button>
      <output data-testid="confirmed" data-done={isConfirmed.value ? '' : undefined} />
    </>
  );
});
