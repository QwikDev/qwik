import { component$, Slot, useSignal, useVisibleTask$ } from '@qwik.dev/core';

export const VisibleTaskDialog = component$(() => {
  const dialogRef = useSignal<HTMLDialogElement>();
  const isOpen = useSignal(false);

  useVisibleTask$(() => {
    document.body.style.overflow = isOpen.value ? 'hidden' : '';
  });

  return (
    <>
      <button
        onClick$={() => {
          isOpen.value = true;
          dialogRef.value?.showModal();
        }}
      >
        Open dialog
      </button>
      <dialog ref={dialogRef}>
        <Slot />
        <button
          onClick$={() => {
            isOpen.value = false;
            dialogRef.value?.close();
          }}
        >
          Close
        </button>
      </dialog>
    </>
  );
});
