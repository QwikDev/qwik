import { getOrCreateContainerContext } from '../../runtime/container-context';
import {
  getActiveInvokeContextOrNull,
  invokeApply,
  newInvokeContext,
} from '../../runtime/invoke-context';
import { setCaptures } from '../../shared/qrl/qrl-captures';
import type { CapturedEventHandler, qWindow, QDispatchHandler, QElement } from '../../shared/types';
import { retryOnPromise } from '../../shared/utils/promises';
import { qTest } from '../../shared/utils/qdev';

type EventHandler = (event: Event, element: Element, ...params: unknown[]) => unknown;
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
    const paramCount = captures?._qParamCount ?? 0;
    const target = element as QElement;
    const args: Parameters<EventHandler> = [event, element];
    if (paramCount === 1) {
      args.push(target._qEventParam);
    } else if (paramCount > 1) {
      args.push(...target._qEventParams!);
    }
    return invokeApply(context, handler, args);
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
  captures?: readonly unknown[] | null,
  paramCount = 0
): QDispatchHandler {
  if (!captures) {
    return wrapDispatch(handler) as QDispatchHandler;
  }

  const captured = captures as CapturedEventHandler;
  if (paramCount !== 0) {
    captured._qParamCount = paramCount;
  }
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

  // Window, document and qvisible events need attrs so qwikloader can find the element.
  if (needsLoaderAttribute(key)) {
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
  if (needsLoaderAttribute(key)) {
    element.removeAttribute?.(key);
  }
}

const needsLoaderAttribute = (key: string) => key.charAt(2) !== 'e' || key === 'q-e:qvisible';

function registerQwikLoaderEvent(element: Element, eventName: string) {
  const qWindow = (qTest ? element.ownerDocument.defaultView : window) as unknown as qWindow;
  const loader = (qWindow._qwikEv ||= [] as any);
  const push = () => loader.push(eventName);
  if (Array.isArray(loader)) {
    // not booted yet: the loader scans the whole document when it starts
    push();
    return;
  }
  if (SCANNED_EVENTS.includes(eventName)) {
    // The loader scans the document, so the push waits until this flush has inserted the element.
    const scheduler = getActiveInvokeContextOrNull()?.container?.scheduler;
    scheduler === undefined ? push() : scheduler.onFlushed(push);
  } else if (!loader.events.has(eventName)) {
    push();
  }
}

/** The loader finds these by attribute, so a new element needs a re-scan. */
const SCANNED_EVENTS = ['e:qvisible', 'd:qinit', 'd:qidle'];

function runCapturedEvent(captures: CapturedEventHandler, event: Event, element: Element): unknown {
  return invokeDispatchHandler(captures._qHandler, captures, event, element);
}
