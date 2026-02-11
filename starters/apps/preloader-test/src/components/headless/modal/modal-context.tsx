import { QRL, Signal, createContextId } from "@qwik.dev/core";

export const modalContextId = createContextId<ModalContext>("qui-modal");

export type ModalContext = {
  // core state
  localId: string;
  showSig: Signal<boolean>;
  onShow$?: QRL<() => void>;
  onClose$?: QRL<() => void>;
  closeOnBackdropClick?: boolean;
  alert?: boolean;
};
