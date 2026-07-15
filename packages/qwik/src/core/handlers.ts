import { isDev } from '@qwik.dev/core/build';
import { createQRL, type QRLInternal } from './shared/qrl/qrl-class';
import { _captures, setCaptures, withCaptures } from './shared/qrl/qrl-captures';
import { assertQrl } from './shared/qrl/qrl-utils';
import { retryOnPromise } from './shared/utils/promises';
import type { ValueOrPromise } from './shared/utils/types';
import { getOrCreateContainerContext, type ContainerContext } from './runtime/container-context';
import { useVisibleTaskQrl, type TaskQrlRef } from './runtime/task';
import { createOwner } from './runtime/owner';
import { invoke, newInvokeContext, type RuntimeInvokeContext } from './runtime/invoke-context';

export { _captures };
export { withCaptures as _withCaptures };

export function _run(this: string, event: Event, element: Element): ValueOrPromise<unknown> {
  if (!element.isConnected) {
    return;
  }
  const context = getOrCreateContainerContext(element);
  return runQrl(
    this,
    event,
    element,
    context,
    context.locale ? newInvokeContext({ container: context }) : null
  );
}

function runQrl(
  thisValue: unknown,
  event: Event,
  element: Element,
  context: ContainerContext,
  invokeContext: RuntimeInvokeContext | null
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
  invokeContext: RuntimeInvokeContext | null
): ValueOrPromise<unknown> {
  const qrlToRun = captures[0] as QRLInternal<(...args: any[]) => void>;
  isDev && assertQrl(qrlToRun);
  return qrlToRun
    .resolve(context)
    .then(() =>
      retryOnPromise(() =>
        invokeContext
          ? invoke(invokeContext, qrlToRun.resolved!, event, element)
          : qrlToRun.resolved!(event, element)
      )
    );
}

export function createVisibleTaskHandlerQrl(
  qrl: QRLInternal
): QRLInternal<(event: Event, element: Element) => ValueOrPromise<void>> {
  return createQRL(null, '_visibleTask', _visibleTask, null, [qrl]);
}

export function _visibleTask(this: string, _event: Event, element: Element): ValueOrPromise<void> {
  if (!element.isConnected) {
    return;
  }
  const context = getOrCreateContainerContext(element);
  if (typeof this === 'string') {
    return context.restoreCaptures(this).then((captures) => {
      setCaptures(captures);
      runCapturedVisibleTask(captures, context);
    });
  }
  runCapturedVisibleTask(_captures!, context);
}

function runCapturedVisibleTask(captures: Readonly<unknown[]>, context: ContainerContext): void {
  const qrlToRun = captures[0] as TaskQrlRef;
  isDev && assertQrl(qrlToRun);
  invoke(newInvokeContext({ owner: createOwner(null), container: context }), () => {
    useVisibleTaskQrl(qrlToRun);
  });
}
