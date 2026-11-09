import { component$, useSignal } from '@qwik.dev/core';
import { Modal } from './modal';
import { ModalContent } from './modal-content';

export default component$(() => {
  const isOpen = useSignal(false);
  return (
    <section class="fixture" data-fixture="modal/modal">
      <h2>modal</h2>
      <button data-testid="trigger" onClick$={() => (isOpen.value = true)}>
        Open
      </button>
      <Modal open={isOpen}>
        <ModalContent />
      </Modal>
    </section>
  );
});
