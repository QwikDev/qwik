import { isDev } from '@qwik.dev/core/build';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import { catchError, retryOnPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import { invokeFromDOM } from '../use/use-core';
import { VNodeFlags } from './types';
import { assertQrl } from '../shared/qrl/qrl-utils';

/**
 * This is called by qwik-loader to run a QRL. It has to be synchronous.
 *
 * @internal
 */
export function _run(this: string, event: Event, element: Element): ValueOrPromise<unknown> {
  return invokeFromDOM(element, event, this, (context, event, element) => {
    console.log('run-qrl', context);
    // This will already check container
    const runQrl = context.$captures$![0] as QRLInternal<unknown>;
    isDev && assertQrl(runQrl);
    const hostElement = context.$hostElement$;
    if (hostElement) {
      return retryOnPromise(() => {
        if (!(hostElement.flags & VNodeFlags.Deleted)) {
          return catchError(runQrl(event, element), (err) => {
            if (context.$container$) {
              context.$container$.handleError(err, hostElement);
            } else {
              throw err;
            }
          });
        }
      });
    }
  });
}
