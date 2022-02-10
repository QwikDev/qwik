import { assertEqual } from '../assert/assert';
import { getInvokeContext } from './use-core';

// <docs markdown="https://hackmd.io/lQ8v7fyhR-WD3b-2aRUpyw#useEvent">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!! (edit https://hackmd.io/lQ8v7fyhR-WD3b-2aRUpyw#useEvent instead)
/**
 * Retrieves the current event which triggered the action.
 *
 * NOTE: The `useEvent` method can only be used in the synchronous portion of the callback
 * (before any `await` statements.)
 *
 * @public
 */
// </docs>
export function useEvent<EVENT extends {}>(expectEventType?: string): EVENT {
  const event = getInvokeContext().event as { type?: string };
  expectEventType && assertEqual(event.type, expectEventType);
  return event as any as EVENT;
}
