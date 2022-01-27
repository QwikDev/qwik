import { getProps } from '../props/props.public';
import { newInvokeContext, useInvoke } from '../use/use-core';
import { useHostElement } from '../use/use-host-element.public';

export function _bubble(eventType: string, payload: {}): void {
  let props = getProps(useHostElement()) as any;
  payload = { type: eventType, ...payload };
  const eventName = 'on:' + eventType;
  while (props) {
    const listener: undefined | (() => void) = props[eventName];
    listener && useInvoke(newInvokeContext(props.__element__, payload), listener);
    props = props.__parent__;
  }
}
