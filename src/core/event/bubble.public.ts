import { _bubble } from './bubble';

/**
 * @public
 */
export function bubble<PAYLOAD>(eventType: string, payload?: PAYLOAD): void {
  return _bubble(eventType, payload || {});
}
