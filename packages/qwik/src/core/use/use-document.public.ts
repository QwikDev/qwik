import { assertEqual } from '../assert/assert';
import { RenderEvent } from '../util/markers';
import { getInvokeContext } from './use-core';

// <docs markdown="../readme.md#useDocument">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useDocument instead)
/**
 * Retrieves the document of the current element. It's important to use this method instead of
 * accessing `document` directly, because during SSR, the global document might not exist.
 *
 * NOTE: `useDocument` method can only be used in the synchronous portion of the callback (before
 * any `await` statements.)
 *
 * @alpha
 */
// </docs>
export function useDocument(): Document {
  const ctx = getInvokeContext();
  assertEqual(ctx.event, RenderEvent);
  const doc = ctx.doc;
  if (!doc) {
    throw new Error('Cant access document for existing context');
  }
  return doc;
}
