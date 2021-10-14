import type { QEvent } from './q-event.public';

export function isQEvent(value: any): value is QEvent {
  return typeof value == 'function' && typeof value.type == 'string';
}
