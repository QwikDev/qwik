import { isBrowser } from '@builder.io/qwik/build';

export const emitEvent = (
  el: Element | undefined,
  eventName: string,
  detail: any,
  bubbles: boolean
) => {
  if (isBrowser || typeof CustomEvent === 'function') {
    if (el) {
      el.dispatchEvent(
        new CustomEvent(eventName, {
          detail,
          bubbles: bubbles,
          composed: bubbles,
        })
      );
    }
  }
};
