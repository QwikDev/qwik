import { setCaptures } from '../../../shared/qrl/qrl-captures';
import type {
  CapturedEventHandler,
  qWindow,
  QDispatchHandler,
  QElement,
} from '../../../shared/types';
import { qTest } from '../../../shared/utils/qdev';

type EventHandler = (event: Event, element: Element) => unknown;

/** @internal */
export function createCapturedEvent(
  handler: EventHandler,
  captures?: readonly unknown[] | null
): QDispatchHandler {
  if (!captures || captures.length === 0) {
    return handler;
  }

  const captured = captures as CapturedEventHandler;
  captured._qHandler = handler;
  captured._qRun = runCapturedEvent;
  return captured;
}

/** @public */
export function setEvent(
  element: Element,
  key: string,
  handler: QDispatchHandler,
  captures?: readonly unknown[] | null
): void {
  const scopedKebabName = key.slice(2);
  const target = element as QElement;
  (target._qDispatch ||= {})[scopedKebabName] = captures
    ? createCapturedEvent(handler as EventHandler, captures)
    : handler;

  // Window and document events need attrs so qwikloader can find the carrier element.
  if (key.charAt(2) !== 'e') {
    element.setAttribute(key, '');
  }
  registerQwikLoaderEvent(element, scopedKebabName);
}

function registerQwikLoaderEvent(element: Element, eventName: string) {
  const qWindow = (qTest ? element.ownerDocument.defaultView : window) as qWindow | null;
  if (qWindow) {
    (qWindow._qwikEv ||= [] as any).push(eventName);
  }
}

function runCapturedEvent(captures: CapturedEventHandler, event: Event, element: Element): unknown {
  setCaptures(captures);
  return captures._qHandler(event, element);
}
