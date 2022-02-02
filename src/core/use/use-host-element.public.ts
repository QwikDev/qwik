import { assertDefined } from '../assert/assert';
import { getInvokeContext } from './use-core';

// <docs markdown="https://hackmd.io/lQ8v7fyhR-WD3b-2aRUpyw#useHostElement">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit https://hackmd.io/lQ8v7fyhR-WD3b-2aRUpyw#useHostElement instead)
/**
 * Retrieves the Host Element of the current component.
 *
 * NOTE: `useHostElement` method can only be used in synchronous portion of the callback (before
 * any `await` statements.)
 *
 * @public
 */
// </docs>
export function useHostElement(): Element {
  const element = getInvokeContext().hostElement!;
  assertDefined(element);
  return element;
}
