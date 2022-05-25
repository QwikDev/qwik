export const emitEvent = (
  el: Element | undefined,
  eventName: string,
  detail: any,
  bubbles: boolean
) => {
  if (el && typeof CustomEvent === 'function') {
    el.dispatchEvent(
      new CustomEvent(eventName, {
        detail,
        bubbles: bubbles,
        composed: bubbles,
      })
    );
  }
};
