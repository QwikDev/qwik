import { _qBubble } from './q-bubble';

/**
 * @public
 */
export function qBubble<PAYLOAD>(eventType: string, payload?: PAYLOAD): void {
  return _qBubble(eventType, payload || {});
}
