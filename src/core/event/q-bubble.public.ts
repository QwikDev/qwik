import { _qBubble } from './q-bubble';
import type { PayloadOf, QEvent } from './q-event.public';

/**
 * @public
 */
export function qBubble<PAYLOAD>(qEvent: string, payload: PAYLOAD): void;
/**
 * @public
 */
export function qBubble<QEVENT extends QEvent>(qEvent: QEVENT, payload: PayloadOf<QEVENT>): void;
/**
 * @public
 */
export function qBubble<QEVENT extends QEvent>(
  qEventType: QEVENT | string,
  payload: Record<string, any>
): void {
  return _qBubble(qEventType, payload);
}
