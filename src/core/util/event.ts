export const emitEvent = (
  el: Element,
  eventName: string,
  detail: Record<string, any>,
  bubbles: boolean
) => {
  if (typeof CustomEvent === 'function') {
    el.dispatchEvent(
      new CustomEvent(eventName, {
        detail,
        bubbles: bubbles,
        composed: bubbles,
      })
    );
  }
};
