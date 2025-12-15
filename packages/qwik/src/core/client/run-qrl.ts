import type { QRLInternal } from '../shared/qrl/qrl-class';
import { catchError, retryOnPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import type { ElementVNode } from '../shared/vnode/element-vnode';
import { getInvokeContext } from '../use/use-core';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { getDomContainer } from './dom-container';
import { VNodeFlags } from './types';

/**
 * This is called by qwik-loader to run a QRL. It has to be synchronous.
 *
 * @internal
 */
export const _run = (...args: unknown[]): ValueOrPromise<unknown> => {
  // This will already check container
  const [runQrl] = useLexicalScope<[QRLInternal<(...args: unknown[]) => unknown>]>();
  const context = getInvokeContext();
  const hostElement = context.$hostElement$;
  if (hostElement) {
    return retryOnPromise(() => {
      if (!(hostElement.flags & VNodeFlags.Deleted)) {
        return catchError(
          () => runQrl(...args),
          (err) => {
            const container = (context.$container$ ||= getDomContainer(
              (hostElement as ElementVNode).node
            ));
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
};
