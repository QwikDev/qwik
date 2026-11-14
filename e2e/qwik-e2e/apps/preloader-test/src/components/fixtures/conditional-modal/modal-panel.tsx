import { component$ } from '@qwik.dev/core';
import { ModalBody } from './modal-body';
import { ModalTitle } from './modal-title';

export const ModalPanel = component$(() => (
  <dialog open class="modal">
    <ModalTitle />
    <ModalBody />
  </dialog>
));
