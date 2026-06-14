import { isDev } from '@qwik.dev/core/build';
import { _captures, setCaptures, withCaptures } from '../core/shared/qrl/qrl-captures';
import type { QRLInternal } from '../core/shared/qrl/qrl-class';
import { assertQrl } from '../core/shared/qrl/qrl-utils';
import type { ValueOrPromise } from '../core/shared/utils/types';
import {
  getOrCreateContainerContext,
  type ContainerContext,
} from '../core/vdomless/runtime/container-context';

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
