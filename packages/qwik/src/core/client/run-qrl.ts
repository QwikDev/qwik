import type { QRLInternal } from '../shared/qrl/qrl-class';
import { retryOnPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import { getInvokeContext } from '../use/use-core';
import { useLexicalScope } from '../use/use-lexical-scope.public';
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
        return runQrl(...args);
      }
    });
  }
};
