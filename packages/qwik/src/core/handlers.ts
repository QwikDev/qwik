import { isDev } from '@qwik.dev/core/build';
import { createQRL, type QRLInternal } from './shared/qrl/qrl-class';
import { _captures, _capturesObj, setCaptures, withCaptures } from './shared/qrl/qrl-captures';
import { assertQrl } from './shared/qrl/qrl-utils';
import { isPromise, retryOnPromise } from './shared/utils/promises';
import type { ValueOrPromise } from './shared/utils/types';
import {
  getOrCreateContainerContext,
  whenRootInflated,
  type ContainerContext,
} from './runtime/container-context';
import type { QElement } from './shared/types';
import type { VisibleTaskSubscription } from './runtime/task';
import { SubscriberFlags } from './reactive/flags';
import { EMPTY_ARRAY } from './utils/consts';
import { invoke, newInvokeContext } from './runtime/invoke-context';

export { _captures, _capturesObj };
export { withCaptures as _withCaptures };

type EventQrl = QRLInternal<(...args: any[]) => void>;

/** Loads the handler and resolves to its start, which qwikloader calls in event order. */
export function _run(this: string, event: Event, element: Element): ValueOrPromise<unknown> {
  if (!element.isConnected) {
    return;
  }
  const context = getOrCreateContainerContext(element);
  const invokeContext = newInvokeContext({ container: context });
  return loadEventQrl(this, context).then((qrl) => {
    const single = element.getAttribute('q:p');
    const multiple = element.getAttribute('q:ps');
    const start = (params: readonly unknown[]) => () =>
      retryOnPromise(() => invoke(invokeContext, qrl.resolved!, event, element, ...params));
    const paramId = single ?? multiple;
    if (paramId === null) {
      return start(EMPTY_ARRAY);
    }
    return context
      .getRoot(paramId)
      .then((value) => whenRootInflated(context, value))
      .then((value) => {
        if (single !== null) {
          (element as QElement)._qEventParam = value;
          return start([value]);
        } else {
          const params = value as readonly unknown[];
          (element as QElement)._qEventParams = params;
          return start(params);
        }
      });
  });
}

function loadEventQrl(thisValue: unknown, context: ContainerContext): Promise<EventQrl> {
  const captures =
    typeof thisValue === 'string'
      ? context.restoreCaptures(thisValue).then((captures) => {
          setCaptures(captures);
          return captures;
        })
      : Promise.resolve(_capturesObj._!);
  return captures.then((captures) => {
    const qrl = captures[0] as EventQrl;
    isDev && assertQrl(qrl);
    return qrl.resolve(context).then(() => qrl);
  });
}

/** The server serializes the subscription itself, so the resumed owner tree runs its cleanups. */
export function createVisibleTaskHandlerQrl(
  subscriptions: VisibleTaskSubscription[]
): QRLInternal<(event: Event, element: Element) => ValueOrPromise<void>> {
  return createQRL(null, '_visibleTask', _visibleTask, null, [subscriptions]);
}

export function _visibleTask(this: string, _event: Event, element: Element): ValueOrPromise<void> {
  if (!element.isConnected) {
    return;
  }
  const context = getOrCreateContainerContext(element);
  if (typeof this === 'string') {
    return context.restoreCaptures(this).then((captures) => {
      setCaptures(captures);
      return runCapturedVisibleTask(captures);
    });
  }
  return runCapturedVisibleTask(_capturesObj._!);
}

function runCapturedVisibleTask(captures: Readonly<unknown[]>): ValueOrPromise<void> {
  return wakeVisibleTasks(captures[0] as VisibleTaskSubscription[]);
}

/**
 * The trigger performs each initial run only once; tracked reruns bypass it. The runs start here,
 * together, so a failure reaches the loader dispatch instead of the scheduler's log.
 */
export function wakeVisibleTasks(subscriptions: VisibleTaskSubscription[]): ValueOrPromise<void> {
  const pending: Promise<void>[] = [];
  for (let i = 0; i < subscriptions.length; i++) {
    const subscription = subscriptions[i];
    if (subscription.triggered) {
      continue;
    }
    subscription.triggered = true;
    subscription.flags |= SubscriberFlags.Dirty;
    const result = subscription.run();
    if (isPromise(result)) {
      pending.push(result);
    }
  }
  return pending.length === 0 ? undefined : Promise.all(pending).then(() => undefined);
}
