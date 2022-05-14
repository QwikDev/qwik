import { QOjectOriginalProxy, QOjectTargetSymbol, SetSubscriber } from '../object/q-object';
import type { WatchDescriptor } from '../watch/watch.public';
import { RenderEvent } from '../util/markers';
import { assertDefined, assertEqual } from '../assert/assert';
import { getInvokeContext } from './use-core';

/**
 * @alpha
 */
export type Subscriber = WatchDescriptor | Element;

/**
 * @alpha
 */
export function useSubscriber<T extends {}>(obj: T): T {
  const ctx = getInvokeContext();
  let subscriber: Subscriber | undefined = ctx.watch;
  if (!subscriber) {
    assertEqual(ctx.event, RenderEvent);
    subscriber = ctx.hostElement;
  }
  assertDefined(subscriber);
  return wrapSubscriber(obj, subscriber!);
}

/**
 * @alpha
 */
export function wrapSubscriber<T extends {}>(obj: T, subscriber: Subscriber) {
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
      ownKeys(target) {
        target[SetSubscriber] = subscriber;
        return Reflect.ownKeys(target);
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
