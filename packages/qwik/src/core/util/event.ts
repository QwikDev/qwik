import { isFunction } from './types';
export const emitEvent = (
  el: Element | undefined,
  eventName: string,
  detail: any,
  bubbles: boolean
) => {
  if (el && isFunction(CustomEvent)) {
    el.dispatchEvent(
      new CustomEvent(eventName, {
        detail,
        bubbles: bubbles,
        composed: bubbles,
      })
    );
  }
};
