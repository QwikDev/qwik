import type { qWindow, QElement } from '../../../shared/types';

/** @public */
export function setEvent(
  element: Element,
  key: string,
  handler: (event: Event, element: Element) => unknown
): void {
  const scopedKebabName = key.slice(2);
  const target = element as QElement;
  (target._qDispatch ||= {})[scopedKebabName] = handler;

  // Window and document events need attrs so qwikloader can find the carrier element.
  if (key.charAt(2) !== 'e') {
    element.setAttribute(key, '');
  }
  registerQwikLoaderEvent(element, scopedKebabName);
}

function registerQwikLoaderEvent(element: Element, eventName: string) {
  const qWindow = element.ownerDocument.defaultView as qWindow | null;
  if (qWindow) {
    (qWindow._qwikEv ||= [] as any).push(eventName);
  }
}
