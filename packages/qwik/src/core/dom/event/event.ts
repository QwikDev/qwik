import {
  getOrCreateContainerContext,
  type ContainerContext,
} from '../../runtime/container-context';
import {
  getActiveInvokeContextOrNull,
  invokeApply,
  newInvokeContext,
} from '../../runtime/invoke-context';
import type { LazyRef } from '../../shared/qrl/qrl-class';
import { setCaptures } from '../../shared/qrl/qrl-captures';
import { isQrl } from '../../shared/qrl/qrl-utils';
import type {
  CapturedEventHandler,
  qWindow,
  QDispatchHandler,
  QElement,
  ScopedEventName,
} from '../../shared/types';
import { retryOnPromise } from '../../shared/utils/promises';
import { qTest } from '../../shared/utils/qdev';
import { OwnerFlags } from '../../reactive/flags';
import { getActiveCollector } from '../../reactive/tracking';
import { CatchPhase, handleError } from '../content/catch-boundary';

type EventHandler = (event: Event, element: Element, ...params: unknown[]) => unknown;
const scopedEventNames = Object.create(null) as Record<string, ScopedEventName | undefined>;

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
  const owner = (element as QElement)._qErrorOwner;
  const context = newInvokeContext({
    container: getOrCreateContainerContext(element),
    ownerHost: owner,
  });
  const start = () =>
    retryOnPromise(
      () => {
        if (captures) {
          setCaptures(captures);
        }
        const paramCount = captures?._qParamCount ?? 0;
        const args: Parameters<EventHandler> = [event, element];
        if (paramCount === 1) {
          args.push((element as QElement)._qEventParam);
        } else if (paramCount > 1) {
          args.push(...(element as QElement)._qEventParams!);
        }
        return invokeApply(context, handler, args);
      },
      owner && ((error) => handleError(owner, error, CatchPhase.Event))
    );
  // A lazy qrl hands the loader its start, or a promise of it while it loads, to keep start order.
  return isQrl(handler) &&
    (handler.$chunk$ || (handler as unknown as { $lazy$: LazyRef }).$lazy$.$symbolFn$)
    ? handler.resolved
      ? start
      : handler.resolve().then(() => start)
    : start();
}

function wrapDispatch(
  handler: QDispatchHandler | QDispatchHandler[]
): QDispatchHandler | QDispatchHandler[] {
  if (typeof handler === 'function') {
    return invokeDispatchHandler.bind(null, handler as EventHandler, null);
  }
  // a captured handler is an array too; its _qRun path already establishes the context
  return Array.isArray(handler) && (handler as CapturedEventHandler)._qRun === undefined
    ? ((handler as QDispatchHandler[]).map(wrapDispatch) as QDispatchHandler[])
    : handler;
}

/** @internal */
export function createCapturedEvent(
  handler: EventHandler,
  captures?: readonly unknown[] | null,
  paramCount = 0
): QDispatchHandler {
  if (!captures && paramCount === 0) {
    return wrapDispatch(handler) as QDispatchHandler;
  }

  // A QRL handler carries its own captures; the array then only holds the row parameter count.
  const captured = (captures ?? []) as CapturedEventHandler;
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
  const scopedKebabName = (scopedEventNames[key] ??= key.slice(2) as ScopedEventName);
  const context = getActiveInvokeContextOrNull<ContainerContext>();
  const owner = context?.owner ?? context?.ownerHost ?? getActiveCollector()?.owner;
  if (owner && owner.flags & OwnerFlags.HasCatch) {
    (element as QElement)._qErrorOwner = owner;
  }
  ((element as QElement)._qDispatch ||= {})[scopedKebabName] = createCapturedEvent(
    handler as EventHandler,
    captures
  );

  // Window, document and qvisible events need attrs so qwikloader can find the element.
  if (needsLoaderAttribute(key)) {
    element.setAttribute(key, '');
  }
  registerQwikLoaderEvent(element, scopedKebabName);
}

/** @internal */
export function removeEvent(element: Element, key: string): void {
  const dispatch = (element as QElement)._qDispatch;
  if (dispatch) {
    delete dispatch[key.slice(2)];
  }
  if (needsLoaderAttribute(key)) {
    element.removeAttribute?.(key);
  }
}

const needsLoaderAttribute = (key: string) => key.charAt(2) !== 'e' || key === 'q-e:qvisible';

function registerQwikLoaderEvent(element: Element, eventName: ScopedEventName) {
  const loader: qWindow['_qwikEv'] | string[] = ((
    (qTest ? element.ownerDocument.defaultView : window) as unknown as qWindow
  )._qwikEv ||= [] as any);
  if (Array.isArray(loader)) {
    // not booted yet: the loader scans the whole document when it starts
    loader.push(eventName);
    return;
  }
  if (SCANNED_EVENTS.includes(eventName)) {
    // The loader scans the document, so the push waits until this flush has inserted the element.
    const scheduler = getActiveInvokeContextOrNull<ContainerContext>()?.container?.scheduler;
    // Kept on the loader so every element of one flush files the same re-scan callback.
    scheduler === undefined
      ? loader.push(eventName)
      : scheduler.onFlushed((loader[eventName] ||= () => loader.push(eventName)));
  } else if (!loader.events.has(eventName)) {
    loader.push(eventName);
  }
}

/** The loader finds these by attribute, so a new element needs a re-scan. */
const SCANNED_EVENTS = ['e:qvisible', 'd:qinit', 'd:qidle'];

function runCapturedEvent(captures: CapturedEventHandler, event: Event, element: Element): unknown {
  return invokeDispatchHandler(captures._qHandler, captures, event, element);
}
