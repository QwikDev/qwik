import { QOjectOriginalProxy, QOjectTargetSymbol, SetSubscriber } from '../object/q-object';
import { isObject } from '../util/types';
import type { WatchDescriptor } from './use-watch';

/**
 * @alpha
 */
export type Subscriber = WatchDescriptor | Element;

/**
 * @alpha
 */
export const wrapSubscriber = <T extends {}>(obj: T, subscriber: Subscriber) => {
  if (isObject(obj)) {
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
      ownKeys(target) {
        target[SetSubscriber] = subscriber;
        return Reflect.ownKeys(target);
      },
    });
  }
  return obj;
};

/**
 * @alpha
 */
export const unwrapSubscriber = <T extends {}>(obj: T) => {
  if (isObject(obj)) {
    const proxy = (obj as any)[QOjectOriginalProxy];
    if (proxy) {
      return proxy;
    }
  }
  return obj;
};
