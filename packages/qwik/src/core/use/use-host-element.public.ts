import { assertDefined } from '../assert/assert';
import { getInvokeContext } from './use-core';

// <docs markdown="./use-store.public.md#useHostElement">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ./use-store.public.md#useHostElement instead)
/**
 * Retrieves the Host Element of the current component.
 *
 * NOTE: `useHostElement` method can only be used in the synchronous portion of the callback
 * (before any `await` statements.)
 *
 * @public
 */
// </docs>
export function useHostElement(): Element {
  const element = getInvokeContext().hostElement!;
  assertDefined(element);
  return element;
}
