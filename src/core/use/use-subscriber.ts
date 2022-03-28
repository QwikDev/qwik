import { useHostElement } from './use-host-element.public';
import { QOjectOriginalProxy, QOjectTargetSymbol, SetSubscriber } from '../object/q-object';
import type { WatchDescriptor } from '../watch/watch.public';

/**
 * @alpha
 */
export function useSubscriber<T extends {}>(obj: T): T {
  return wrapSubscriber(obj, useHostElement());
}

/**
 * @alpha
 */
export function wrapSubscriber<T extends {}>(obj: T, subscriber: Element | WatchDescriptor) {
  if (obj && typeof obj === 'object') {
    const target = (obj as any)[QOjectTargetSymbol];
    if (!target) {
      return obj;
    }
    return new Proxy<any>(obj, {
      get(target, prop) {
        if (prop === QOjectOriginalProxy) {
          return target;
        }
        target[SetSubscriber] = subscriber;
        return target[prop];
      },
    });
  }
  return obj;
}

/**
 * @alpha
 */
export function unwrapSubscriber<T extends {}>(obj: T) {
  if (obj && typeof obj === 'object') {
    const proxy = (obj as any)[QOjectOriginalProxy];
    if (proxy) {
      return proxy;
    }
  }
  return obj;
}
