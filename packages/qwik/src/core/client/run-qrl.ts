import { isDev } from '@qwik.dev/core/build';
import { _captures, type QRLInternal } from '../shared/qrl/qrl-class';
import { assertQrl } from '../shared/qrl/qrl-utils';
import type { QRL } from '../shared/qrl/qrl.public';
import type { Container } from '../shared/types';
import { ITERATION_ITEM_MULTI, ITERATION_ITEM_SINGLE } from '../shared/utils/markers';
import { retryOnPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import type { ElementVNode } from '../shared/vnode/element-vnode';
import { invokeFromDOM } from '../use/use-core';
import { getDomContainer } from './dom-container';
import { VNodeFlags } from './types';
import { vnode_ensureElementInflated, vnode_getProp } from './vnode-utils';

/**
 * This safely calls an event handler, handling errors and retrying on thrown Promises, and
 * providing extra parameters defined on the elements as arguments (used for loop optimization)
 */
export function runEventHandlerQRL(
  container: Container | undefined,
  hostElement: ElementVNode,
  qrl: QRL<(...args: any[]) => void>,
  event: Event,
  element: Element,
  useGetObjectById: boolean
): void | Promise<void> {
  // Note, try passing a flag to indicate iteration item so we dont have to do the lookups here
  const getObjectById = useGetObjectById ? container?.$getObjectById$ || null : null;
  const handleError = (err: any) => {
    if (container) {
      container.handleError(err, hostElement);
    } else {
      throw err;
    }
  };
  try {
    return retryOnPromise(() => {
      // Check if the host element was deleted while waiting for the promise to resolve
      if (!(hostElement.flags & VNodeFlags.Deleted)) {
        const singleItem = vnode_getProp<unknown>(
          hostElement,
          ITERATION_ITEM_SINGLE,
          getObjectById
        );
        if (singleItem !== null) {
          return qrl(event, element, singleItem);
        }
        const multiItems = vnode_getProp<unknown[]>(
          hostElement,
          ITERATION_ITEM_MULTI,
          getObjectById
        );
        if (multiItems !== null) {
          return qrl(event, element, ...multiItems);
        }
        return qrl(event, element);
      }
    })?.catch?.(handleError);
  } catch (err) {
    handleError(err);
  }
}

/**
 * This is called by qwik-loader to run a QRL. It has to be synchronous.
 *
 * @internal
 */
export function _run(
  this: string | undefined,
  event: Event,
  element: Element
): ValueOrPromise<unknown> {
  return invokeFromDOM(element, event, this, (context, event, element) => {
    const hostElement = context.$hostElement$ as ElementVNode;
    if (hostElement) {
      const runQrl = _captures![0] as QRLInternal<(...args: any[]) => void>;
      isDev && assertQrl(runQrl);
      context.$container$ ||= getDomContainer(hostElement.node as Element);
      vnode_ensureElementInflated(hostElement);
      return runEventHandlerQRL(context.$container$, hostElement, runQrl, event, element, true);
    }
  });
}
