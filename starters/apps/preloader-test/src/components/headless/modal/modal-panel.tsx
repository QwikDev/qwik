import {
  $,
  PropsOf,
  QRL,
  Signal,
  Slot,
  component$,
  useSignal,
  useStyles$,
  useTask$,
  sync$,
  useContext,
  isServer,
} from "@qwik.dev/core";

import { modalContextId } from "./modal-context";

import { useModal } from "./use-modal";

import { enableBodyScroll } from "body-scroll-lock-upgrade";

export type ModalProps = Omit<PropsOf<"dialog">, "open"> & {
  onShow$?: QRL<() => void>;
  onClose$?: QRL<() => void>;
  "bind:show": Signal<boolean>;
  closeOnBackdropClick?: boolean;
  alert?: boolean;
};

export const HModalPanel = component$((props: PropsOf<"dialog">) => {
  const {
    activateFocusTrap,
    closeModal,
    deactivateFocusTrap,
    showModal,
    trapFocus,
    wasModalBackdropClicked,
  } = useModal();
  const context = useContext(modalContextId);

  const panelRef = useSignal<HTMLDialogElement>();

  useTask$(async function toggleModal({ track, cleanup }) {
    const isOpen = track(() => context.showSig.value);

    if (!panelRef.value) {
      return;
    }

    const focusTrap = await trapFocus(panelRef.value);

    if (isOpen) {
      // HACK: keep modal scroll position in place with iOS
      const storedRequestAnimationFrame = window.requestAnimationFrame;
      window.requestAnimationFrame = () => 42;

      await showModal(panelRef.value);
      window.requestAnimationFrame = storedRequestAnimationFrame;
      activateFocusTrap(focusTrap);
    } else {
      await closeModal(panelRef.value);
    }

    cleanup(async () => {
      if (isServer) {
        return;
      }
      await deactivateFocusTrap(focusTrap);
      if (!panelRef.value) {
        return;
      }
      enableBodyScroll(panelRef.value);
    });
  });

  useTask$(async ({ track }) => {
    track(() => context.showSig.value);

    if (context.showSig.value) {
      await context.onShow$?.();
    } else {
      await context.onClose$?.();
    }
  });

  const closeOnBackdropClick$ = $(async (e: MouseEvent) => {
    if (context.alert === true || context.closeOnBackdropClick === false) {
      return;
    }

    // We do not want to close elements that dangle outside of the modal
    if (!(e.target instanceof HTMLDialogElement)) {
      return;
    }

    if (await wasModalBackdropClicked(panelRef.value, e)) {
      context.showSig.value = false;
    }
  });

  const handleKeyDownSync$ = sync$((e: KeyboardEvent) => {
    const keys = [" ", "Enter"];

    if (e.target instanceof HTMLDialogElement && keys.includes(e.key)) {
      e.preventDefault();
    }

    if (e.key === "Escape") {
      e.preventDefault();
    }
  });

  const handleKeyDown$ = $((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      context.showSig.value = false;
      e.stopPropagation();
    }
  });

  return (
    <dialog
      {...props}
      id={`${context.localId}-root`}
      aria-labelledby={`${context.localId}-title`}
      aria-describedby={`${context.localId}-description`}
      // TODO: deprecate data-state in favor of data-open, data-closing, and data-closed
      data-state={context.showSig.value ? "open" : "closed"}
      data-open={context.showSig.value && ""}
      data-closed={!context.showSig.value && ""}
      role={context.alert === true ? "alertdialog" : "dialog"}
      ref={panelRef}
      onKeyDown$={[handleKeyDownSync$, handleKeyDown$, props.onKeyDown$]}
      onClick$={async (e) => {
        e.stopPropagation();
        await closeOnBackdropClick$(e);
      }}
    >
      <Slot />
    </dialog>
  );
});
