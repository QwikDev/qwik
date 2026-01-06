import type { QRLInternal } from '../shared/qrl/qrl-class';
import { ITERATION_ITEM } from '../shared/utils/markers';
import { retryOnPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import type { VNode } from '../shared/vnode/vnode';
import { getInvokeContext } from '../use/use-core';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { VNodeFlags } from './types';
import { vnode_ensureElementInflated, vnode_getProp } from './vnode-utils';

/**
 * This is called by qwik-loader to run a QRL. It has to be synchronous.
 *
 * @internal
 */
export const _run = (...args: unknown[]): ValueOrPromise<unknown> => {
  // This will already check container
  const [runQrl] = useLexicalScope<[QRLInternal<(...args: unknown[]) => unknown>]>();
  const context = getInvokeContext();
  const hostElement = context.$hostElement$ as VNode;
  if (hostElement) {
    vnode_ensureElementInflated(hostElement);
    return retryOnPromise(() => {
      if (!(hostElement.flags & VNodeFlags.Deleted)) {
        const iterationItems = vnode_getProp<unknown[]>(
          hostElement,
          ITERATION_ITEM,
          context.$container$?.$getObjectById$ || null
        );
        return (iterationItems ? runQrl(args[0], args[1], ...iterationItems) : runQrl(...args)).catch((err) => {
          const container = context.$container$;
          if (container) {
            container.handleError(err, hostElement);
          } else {
            throw err;
          }
        });
      }
    });
  }
};
