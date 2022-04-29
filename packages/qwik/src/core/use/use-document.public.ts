import { getInvokeContext } from './use-core';

/**
 * @public
 */
export function useDocument(): Document {
  const doc = getInvokeContext().doc;
  if (!doc) {
    throw new Error('Cant access document for existing context');
  }
  return doc;
}
