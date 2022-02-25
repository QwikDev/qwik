import { getContext, getEvent } from '../props/props';
import { newInvokeContext, useInvoke } from '../use/use-core';
import { useHostElement } from '../use/use-host-element.public';

export function _bubble(eventType: string, payload: {}): void {
  let node = useHostElement() as HTMLElement | null;
  payload = { type: eventType, ...payload };
  const eventName = 'on:' + eventType;
  while (node) {
    const ctx = getContext(node) as any;
    const listener: undefined | (() => void) = getEvent(ctx, eventName);
    listener && useInvoke(newInvokeContext(node, payload), listener);
    node = node.parentElement;
  }
}
