// keep this import from qwik/build so the cjs build works
import { isBrowser } from '@builder.io/qwik/build';
import { qTest } from './qdev';

export const emitEvent = (
  el: Element | undefined,
  eventName: string,
  detail: any,
  bubbles: boolean
) => {
  if (!qTest && (isBrowser || typeof CustomEvent === 'function')) {
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
