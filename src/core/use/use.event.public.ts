import { assertEqual } from '../assert/assert';
import { getInvokeContext } from './use-core';

/**
 * @public
 */

export function useEvent(): Event;
/**
 * @public
 */
export function useEvent<EVENT extends {}>(): EVENT;
/**
 * @public
 */
export function useEvent<EVENT extends {}>(expectEventType?: string): EVENT {
  const event = getInvokeContext().event as { type?: string };
  expectEventType && assertEqual(event.type, expectEventType);
  return event as any as EVENT;
}
