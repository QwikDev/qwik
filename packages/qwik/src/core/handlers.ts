import { isDev } from '@qwik.dev/core/build';
import { createQRL, type QRLInternal } from './shared/qrl/qrl-class';
import { _captures, setCaptures, withCaptures } from './shared/qrl/qrl-captures';
import { assertQrl } from './shared/qrl/qrl-utils';
import { retryOnPromise } from './shared/utils/promises';
import type { ValueOrPromise } from './shared/utils/types';
import { getOrCreateContainerContext, type ContainerContext } from './runtime/container-context';
import type { VisibleTaskSubscription } from './runtime/task';
import { invoke, newInvokeContext, type RuntimeInvokeContext } from './runtime/invoke-context';

export { _captures };
export { withCaptures as _withCaptures };

export function _run(this: string, event: Event, element: Element): ValueOrPromise<unknown> {
  if (!element.isConnected) {
    return;
  }
  const context = getOrCreateContainerContext(element);
  return runQrl(this, event, element, context, newInvokeContext({ container: context }));
}

function runQrl(
  thisValue: unknown,
  event: Event,
  element: Element,
  context: ContainerContext,
  invokeContext: RuntimeInvokeContext
): ValueOrPromise<unknown> {
  if (typeof thisValue === 'string') {
    return context.restoreCaptures(thisValue).then((captures) => {
      setCaptures(captures);
      return runCapturedQrl(captures, event, element, context, invokeContext);
    });
  }
  return runCapturedQrl(_captures!, event, element, context, invokeContext);
}

function runCapturedQrl(
  captures: Readonly<unknown[]>,
  event: Event,
  element: Element,
  context: ContainerContext,
  invokeContext: RuntimeInvokeContext
): ValueOrPromise<unknown> {
  const qrlToRun = captures[0] as QRLInternal<(...args: any[]) => void>;
  isDev && assertQrl(qrlToRun);
  return qrlToRun
    .resolve(context)
    .then(() => retryOnPromise(() => invoke(invokeContext, qrlToRun.resolved!, event, element)));
}

/** The server serializes the subscription itself, so the resumed owner tree runs its cleanups. */
export function createVisibleTaskHandlerQrl(
  subscription: VisibleTaskSubscription
): QRLInternal<(event: Event, element: Element) => ValueOrPromise<void>> {
  return createQRL(null, '_visibleTask', _visibleTask, null, [subscription]);
}

export function _visibleTask(this: string, _event: Event, element: Element): ValueOrPromise<void> {
  if (!element.isConnected) {
    return;
  }
  const context = getOrCreateContainerContext(element);
  if (typeof this === 'string') {
    return context.restoreCaptures(this).then((captures) => {
      setCaptures(captures);
      runCapturedVisibleTask(captures);
    });
  }
  runCapturedVisibleTask(_captures!);
}

function runCapturedVisibleTask(captures: Readonly<unknown[]>): void {
  wakeVisibleTask(captures[0] as VisibleTaskSubscription);
}

/** The trigger performs the initial run only; tracked reruns bypass it. */
export function wakeVisibleTask(subscription: VisibleTaskSubscription): void {
  if (subscription.triggered) {
    return;
  }
  subscription.triggered = true;
  subscription.scheduler.notify(subscription);
}
