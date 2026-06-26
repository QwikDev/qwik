import { isDev } from '@qwik.dev/core/build';
import { createQRL } from '../core/shared/qrl/qrl-class';
import { _captures, setCaptures, withCaptures } from '../core/shared/qrl/qrl-captures';
import type { QRLInternal } from '../core/shared/qrl/qrl-class';
import { assertQrl } from '../core/shared/qrl/qrl-utils';
import type { ValueOrPromise } from '../core/shared/utils/types';
import {
  getOrCreateContainerContext,
  type ContainerContext,
} from '../core/vdomless/runtime/container-context';
import { createVisibleTaskQrl, type TaskQrlRef } from '../core/vdomless/runtime/task';
import { createOwner } from '../core/vdomless/runtime/owner';
import { invoke, newInvokeContext } from '../core/vdomless/runtime/invoke-context';

export { _captures };
export { withCaptures as _withCaptures };

export function _run(this: string, event: Event, element: Element): ValueOrPromise<unknown> {
  if (!element.isConnected) {
    return;
  }

  const context = getOrCreateContainerContext(element);
  if (typeof this === 'string') {
    return context.restoreCaptures(this).then((captures) => {
      setCaptures(captures);
      return runCapturedQrl(captures, event, element, context);
    });
  }

  return runCapturedQrl(_captures!, event, element, context);
}

function runCapturedQrl(
  captures: Readonly<unknown[]>,
  event: Event,
  element: Element,
  context: ContainerContext
): ValueOrPromise<unknown> {
  const qrlToRun = captures[0] as QRLInternal<(...args: any[]) => void>;
  isDev && assertQrl(qrlToRun);
  return qrlToRun.resolve(context).then(() => qrlToRun.resolved!(event, element));
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
    createVisibleTaskQrl(qrlToRun);
  });
}
