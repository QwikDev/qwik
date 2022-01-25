import { qProps } from '../props/q-props.public';
import { newInvokeContext, useInvoke } from '../use/use-core';
import { useHostElement } from '../use/use-host-element.public';

export function _qBubble(eventType: string, payload: {}): void {
  let props = qProps(useHostElement()) as any;
  payload = { type: eventType, ...payload };
  const eventName = 'on:' + eventType;
  while (props) {
    const listener: undefined | (() => void) = props[eventName];
    listener && useInvoke(newInvokeContext(props.__element__, payload), listener);
    props = props.__parent__;
  }
}
