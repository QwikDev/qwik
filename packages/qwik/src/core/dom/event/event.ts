import { getOrCreateContainerContext } from '../../runtime/container-context';
import { invokeApply, newInvokeContext } from '../../runtime/invoke-context';
import { setCaptures } from '../../shared/qrl/qrl-captures';
import type { CapturedEventHandler, qWindow, QDispatchHandler, QElement } from '../../shared/types';
import { retryOnPromise } from '../../shared/utils/promises';
import { qTest } from '../../shared/utils/qdev';

type EventHandler = (event: Event, element: Element) => unknown;
const scopedEventNames = Object.create(null) as Record<string, string | undefined>;

// Qwikloader calls _qDispatch entries bare, so the invoke context is established here.
function invokeDispatchHandler(
  handler: EventHandler,
  captures: CapturedEventHandler | null,
  event: Event,
  element: Element
): unknown {
  if (!element.isConnected) {
    return;
  }
  const context = newInvokeContext({ container: getOrCreateContainerContext(element) });
  return retryOnPromise(() => {
    if (captures) {
      setCaptures(captures);
    }
    return invokeApply(context, handler, [event, element]);
  });
}

function wrapDispatch(
  handler: QDispatchHandler | QDispatchHandler[]
): QDispatchHandler | QDispatchHandler[] {
  // a captured handler is an array too; its _qRun path already establishes the context
  if (
    handler != null &&
    typeof handler !== 'function' &&
    (handler as CapturedEventHandler)._qRun !== undefined
  ) {
    return handler;
  }
  if (Array.isArray(handler)) {
    return handler.map((entry) => wrapDispatch(entry as QDispatchHandler) as QDispatchHandler);
  }
  return typeof handler === 'function'
    ? invokeDispatchHandler.bind(null, handler as EventHandler, null)
    : handler;
}

/** @internal */
export function createCapturedEvent(
  handler: EventHandler,
  captures?: readonly unknown[] | null
): QDispatchHandler {
  if (!captures || captures.length === 0) {
    return wrapDispatch(handler) as QDispatchHandler;
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
  handler: QDispatchHandler | QDispatchHandler[],
  captures?: readonly unknown[] | null
): void {
  const scopedKebabName = (scopedEventNames[key] ??= key.slice(2));
  const target = element as QElement;
  (target._qDispatch ||= {})[scopedKebabName] = captures
    ? createCapturedEvent(handler as EventHandler, captures)
    : wrapDispatch(handler);

  // Window and document events need attrs so qwikloader can find the carrier element.
  if (key.charAt(2) !== 'e') {
    element.setAttribute(key, '');
  }
  registerQwikLoaderEvent(element, scopedKebabName);
}

/** @internal */
export function removeEvent(element: Element, key: string): void {
  const scopedKebabName = key.slice(2);
  const target = element as QElement;
  if (target._qDispatch) {
    delete target._qDispatch[scopedKebabName];
  }
  if (key.charAt(2) !== 'e') {
    element.removeAttribute?.(key);
  }
}

function registerQwikLoaderEvent(element: Element, eventName: string) {
  const qWindow = (qTest ? element.ownerDocument.defaultView : window) as unknown as qWindow;
  const loader = (qWindow._qwikEv ||= [] as any);
  if (!Array.isArray(loader) && loader.events.has(eventName)) {
    return;
  }
  loader.push(eventName);
}

function runCapturedEvent(captures: CapturedEventHandler, event: Event, element: Element): unknown {
  return invokeDispatchHandler(captures._qHandler, captures, event, element);
}
