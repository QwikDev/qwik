import { assertDefined } from '../assert/assert';
import { getInvokeContext } from './use-core';

/**
 * @public
 */
export function useHostElement(): Element {
  const element = getInvokeContext().hostElement!;
  assertDefined(element);
  return element;
}
