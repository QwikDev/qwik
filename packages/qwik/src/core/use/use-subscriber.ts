import { assertDefined, assertEqual } from '../assert/assert';
import {
  getQObjectState,
  QOjectAllSymbol,
  QOjectOriginalProxy,
  QOjectTargetSymbol,
  SetSubscriber,
  wrap,
} from '../object/q-object';
import { RenderEvent } from '../util/markers';
import type { WatchDescriptor } from '../watch/watch.public';
import { getInvokeContext } from './use-core';

/**
 * @alpha
 */
export type Subscriber = WatchDescriptor | Element;

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

/**
 * @alpha
 */
export function useTrack<T extends {}, B extends keyof T>(obj: T, prop?: B): T[B] {
  const ctx = getInvokeContext();
  assertEqual(ctx.event, RenderEvent);
  const hostElement = ctx.hostElement!;
  assertDefined(hostElement);
  const doc = ctx.doc!;
  assertDefined(doc);

  obj = wrap(obj, getQObjectState(doc));
  (obj as any)[SetSubscriber] = hostElement;
  if (prop) {
    return obj[prop];
  } else {
    return (obj as any)[QOjectAllSymbol];
  }
}
