import { isDev } from '@qwik.dev/core/build';
import { currentCaptures, type QRLInternal } from '../shared/qrl/qrl-class';
import { assertQrl } from '../shared/qrl/qrl-utils';
import type { QRL } from '../shared/qrl/qrl.public';
import type { Container } from '../shared/types';
import { ITERATION_ITEM_MULTI, ITERATION_ITEM_SINGLE } from '../shared/utils/markers';
import { retryOnPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import type { ElementVNode } from '../shared/vnode/element-vnode';
import type { VNode } from '../shared/vnode/vnode';
import { invokeFromDOM } from '../use/use-core';
import { getDomContainer } from './dom-container';
import { VNodeFlags } from './types';
import { vnode_ensureElementInflated, vnode_getProp } from './vnode-utils';

export function callQrl(
  container: Container | undefined,
  host: VNode,
  qrl: QRL,
  event: unknown,
  element: unknown,
  useGetObjectById: boolean
): Promise<unknown> {
  const getObjectById = useGetObjectById ? container?.$getObjectById$ || null : null;
  const singleItem = vnode_getProp<unknown>(host, ITERATION_ITEM_SINGLE, getObjectById);
  if (singleItem !== null) {
    return qrl(event, element, singleItem);
  }
  const multiItems = vnode_getProp<unknown[]>(host, ITERATION_ITEM_MULTI, getObjectById);
  if (multiItems !== null) {
    return qrl(event, element, ...multiItems);
  }
  return qrl(event, element);
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
      const runQrl = currentCaptures![0] as QRLInternal<unknown>;
      isDev && assertQrl(runQrl);
      context.$container$ ||= getDomContainer(hostElement.node as Element);
      vnode_ensureElementInflated(hostElement);
      return retryOnPromise(() => {
        if (!(hostElement.flags & VNodeFlags.Deleted)) {
          return callQrl(context.$container$, hostElement, runQrl, event, element, true).catch(
            (err) => {
              const container = context.$container$;
              if (container) {
                container.handleError(err, hostElement);
              } else {
                throw err;
              }
            }
          );
        }
      });
    }
  });
}
