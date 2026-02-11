import { FocusTrap, createFocusTrap } from "focus-trap";
import { $ } from "@qwik.dev/core";

export type WidthState = {
  width: number | null;
};

import { enableBodyScroll, disableBodyScroll } from "body-scroll-lock-upgrade";

export function useModal() {
  /**
   * Listens for animation/transition events in order to
   * remove Animation-CSS-Classes after animation/transition ended.
   */
  const supportClosingAnimation = $((modal: HTMLDialogElement) => {
    modal.dataset.closing = "";
    modal.classList.add("modal-closing");

    const { animationDuration, transitionDuration } = getComputedStyle(modal);

    if (animationDuration !== "0s") {
      modal.addEventListener(
        "animationend",
        (e) => {
          if (e.target === modal) {
            delete modal.dataset.closing;
            modal.classList.remove("modal-closing");
            enableBodyScroll(modal);
            modal.close();
          }
        },
        { once: true },
      );
    } else if (transitionDuration !== "0s") {
      modal.addEventListener(
        "transitionend",
        (e) => {
          if (e.target === modal) {
            delete modal.dataset.closing;
            modal.classList.remove("modal-closing");
            enableBodyScroll(modal);
            modal.close();
          }
        },
        { once: true },
      );
    } else if (animationDuration === "0s" && transitionDuration === "0s") {
      delete modal.dataset.closing;
      modal.classList.remove("modal-closing");
      enableBodyScroll(modal);
      modal.close();
    }
  });

  /**
   * Traps the focus of the given Modal
   * @returns FocusTrap
   */
  const trapFocus = $((modal: HTMLDialogElement): FocusTrap => {
    return createFocusTrap(modal, { escapeDeactivates: false });
  });

  const activateFocusTrap = $((focusTrap: FocusTrap | null) => {
    try {
      focusTrap?.activate();
    } catch {
      // Activating the focus trap throws if no tabbable elements are inside the container.
      // If this is the case we are fine with not activating the focus trap.
      // That's why we ignore the thrown error.
    }
  });

  const deactivateFocusTrap = $((focusTrap: FocusTrap | null) => {
    focusTrap?.deactivate();
    focusTrap = null;
  });

  /**
   * Shows the given Modal.
   * Applies a CSS-Class to animate the modal-showing.
   * Calls the given callback that is executed after the Modal has been opened.
   */
  const showModal = $(async (modal: HTMLDialogElement) => {
    disableBodyScroll(modal, { reserveScrollBarGap: true });
    modal.showModal();
  });

  /**
   * Closes the given Modal.
   * Applies a CSS-Class to animate the Modal-closing.
   * Calls the given callback that is executed after the Modal has been closed.
   */
  const closeModal = $(async (modal: HTMLDialogElement) => {
    await supportClosingAnimation(modal);
  });

  /**
   * Determines if the backdrop of the Modal has been clicked.
   */
  const wasModalBackdropClicked = $(
    (modal: HTMLDialogElement | undefined, clickEvent: MouseEvent): boolean => {
      if (!modal) {
        return false;
      }

      const rect = modal.getBoundingClientRect();

      const wasBackdropClicked =
        rect.left > clickEvent.clientX ||
        rect.right < clickEvent.clientX ||
        rect.top > clickEvent.clientY ||
        rect.bottom < clickEvent.clientY;

      /**
       * If the inside focusable elements are not prevented, such as a button it will also fire a click event.
       *
       * Hitting the enter or space keys on a button inside of the dialog for example, will fire a "pointer" event. In reality, it fires our onClick$ handler because we have not prevented the default behavior.
       *
       * This is why we check if the pointerId is -1.
       **/
      return (clickEvent as PointerEvent).pointerId === -1
        ? false
        : wasBackdropClicked;
    },
  );

  return {
    trapFocus,
    activateFocusTrap,
    deactivateFocusTrap,
    showModal,
    closeModal,
    wasModalBackdropClicked,
    supportClosingAnimation,
  };
}
