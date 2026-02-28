import { isDev } from '@qwik.dev/core/build';
import {
  _captures,
  deserializeCaptures,
  setCaptures,
  type QRLInternal,
} from '../shared/qrl/qrl-class';
import { assertQrl } from '../shared/qrl/qrl-utils';
import type { QRL } from '../shared/qrl/qrl.public';
import { ITERATION_ITEM_MULTI, ITERATION_ITEM_SINGLE } from '../shared/utils/markers';
import { retryOnPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import type { ElementVNode } from '../shared/vnode/element-vnode';
import { invokeApply, newInvokeContextFromDOM, type InvokeContext } from '../use/use-core';
import { VNodeFlags } from './types';
import { vnode_ensureElementInflated, vnode_getProp } from './vnode-utils';

/**
 * This safely calls an event handler, handling errors and retrying on thrown Promises, and
 * providing extra parameters defined on the elements as arguments (used for loop optimization)
 */
export function runEventHandlerQRL(
  handler: QRL<(...args: any[]) => void>,
  event: Event,
  element: Element,
  ctx?: InvokeContext
): void | Promise<void> {
  if (!element.isConnected) {
    // ignore events on disconnected elements, this can happen when the event is triggered while the element is being removed
    return;
  }
  if (!ctx) {
    ctx = newInvokeContextFromDOM(event, element);
  }
  const container = ctx.$container$!;
  const hostElement = ctx.$hostElement$ as ElementVNode;
  vnode_ensureElementInflated(container, hostElement);
  let realHandler = handler;

  if (hostElement.flags & VNodeFlags.HasIterationItems) {
    let shouldInflate: boolean | undefined;
    if (!(hostElement.flags & VNodeFlags.InflatedIterationItems)) {
      shouldInflate = true;
      hostElement.flags |= VNodeFlags.InflatedIterationItems;
    }
    const getObj = shouldInflate ? container.$getObjectById$ : null;
    const singleItem = vnode_getProp<unknown>(hostElement, ITERATION_ITEM_SINGLE, getObj);
    if (singleItem !== null) {
      realHandler = (() => handler(event, element, singleItem)) as typeof handler;
    } else {
      const multiItems = vnode_getProp<unknown[]>(hostElement, ITERATION_ITEM_MULTI, getObj);
      if (multiItems !== null) {
        realHandler = (() => handler(event, element, ...multiItems)) as typeof handler;
      }
    }
  }

  return retryOnPromise(
    () => {
      // Check if the host element was deleted while waiting for the promise to resolve
      if (!(hostElement.flags & VNodeFlags.Deleted)) {
        return invokeApply(ctx, realHandler, [event, element]);
      }
    },
    (err) => container.handleError(err, hostElement)
  );
}

/**
 * This is called by qwik-loader to run a QRL. It has to be synchronous when possible.
 *
 * @internal
 */
export function _run(this: string, event: Event, element: Element): ValueOrPromise<unknown> {
  if (!element.isConnected) {
    // ignore events on disconnected elements, this can happen when the event is triggered while the element is being removed
    return;
  }
  const ctx = newInvokeContextFromDOM(event, element);
  if (typeof this === 'string') {
    setCaptures(deserializeCaptures(ctx.$container$!, this));
  }
  const qrlToRun = _captures![0] as QRLInternal<(...args: any[]) => void>;
  isDev && assertQrl(qrlToRun);
  return runEventHandlerQRL(qrlToRun, event, element, ctx);
}
