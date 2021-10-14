import { qProps } from '../props/q-props.public';
import { useHostElement } from '../use/use-core.public';
import type { QEvent } from './q-event.public';

export function _qBubble(eventType: string | QEvent, payload: {}): void {
  let props = qProps(useHostElement()) as any;
  const type = typeof eventType == 'string' ? eventType : eventType.type;
  payload = { type, ...payload };
  const eventName = 'on:' + type;
  while (props) {
    const listener: undefined | ((payload: {}) => void) = props[eventName];
    listener && listener(payload);
    props = props.__parent__;
  }
}
