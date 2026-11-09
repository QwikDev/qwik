import { component$, isServer, Slot, useSignal, useTask$, type Signal } from '@qwik.dev/core';

export const Modal = component$<{ open: Signal<boolean> }>(({ open }) => {
  const dialog = useSignal<HTMLDialogElement>();

  useTask$(({ track }) => {
    const isOpen = track(open);
    if (isServer) {
      return;
    }
    if (isOpen) {
      dialog.value?.showModal();
    } else {
      dialog.value?.close();
    }
  });

  return (
    <dialog ref={dialog} class="modal">
      {open.value && <Slot />}
      <button onClick$={() => (open.value = false)}>Close</button>
    </dialog>
  );
});
