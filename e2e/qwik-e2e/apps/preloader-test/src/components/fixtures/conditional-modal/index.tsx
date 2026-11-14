import { component$, useSignal } from '@qwik.dev/core';
import { ModalPanel } from './modal-panel';

export default component$(() => {
  const isOpen = useSignal(false);
  return (
    <section class="fixture" data-fixture="conditional-modal">
      <h2>conditional modal</h2>
      <button data-testid="trigger" onClick$={() => (isOpen.value = true)}>
        Open
      </button>
      {isOpen.value && <ModalPanel />}
    </section>
  );
});
