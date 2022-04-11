import { assertEqual } from '../assert/assert';
import { QError, qError } from '../error/error';
import { isQrl } from '../import/qrl-class';
import {
  getRenderingState,
  notifyRender,
  RenderingState,
  scheduleFrame,
} from '../render/notify-render';
import { getContainer, tryGetInvokeContext } from '../use/use-core';
import { isElement } from '../util/element';
import { logWarn } from '../util/log';
import { qDev, qTest } from '../util/qdev';
import { debugStringify } from '../util/stringify';
import { runWatch, WatchDescriptor, WatchMode } from '../watch/watch.public';
import type { Subscriber } from '../use/use-subscriber';

export type ObjToProxyMap = WeakMap<any, any>;
export type QObject<T extends {}> = T & { __brand__: 'QObject' };

const ProxyMapSymbol = Symbol('ProxyMapSymbol');

export function getProxyMap(doc: Document): ObjToProxyMap {
  let map = (doc as any)[ProxyMapSymbol];
  if (!map) {
    map = (doc as any)[ProxyMapSymbol] = new WeakMap();
  }
  return map;
}

export function qObject<T extends Object>(obj: T, proxyMap: ObjToProxyMap): T {
  assertEqual(unwrapProxy(obj), obj, 'Unexpected proxy at this location');
  if (obj == null || typeof obj !== 'object') {
    // TODO(misko): centralize
    throw new Error(
      `Q-ERROR: Only objects can be wrapped in 'QObject', got ` + debugStringify(obj)
    );
  }
  if (obj.constructor !== Object) {
    throw new Error(
      `Q-ERROR: Only objects literals can be wrapped in 'QObject', got ` + debugStringify(obj)
    );
  }
  return readWriteProxy(obj as any as QObject<T>, proxyMap);
}

export function _restoreQObject<T>(obj: T, map: ObjToProxyMap, subs: Map<Element, Set<string>>): T {
  return readWriteProxy(obj as any as QObject<T>, map, subs);
}

/**
 * Creates a proxy which notifies of any writes.
 */
export function readWriteProxy<T extends object>(
  target: T,
  proxyMap: ObjToProxyMap,
  subs?: Map<Element, Set<string>>
): T {
  if (!target || typeof target !== 'object') return target;
  let proxy = proxyMap.get(target);
  if (proxy) return proxy;

  proxy = new Proxy(target, new ReadWriteProxyHandler(proxyMap, subs)) as any as T;
  proxyMap.set(target, proxy);
  return proxy;
}

export const QOjectTargetSymbol = ':target:';
export const QOjectSubsSymbol = ':subs:';
export const QOjectOriginalProxy = ':proxy:';
export const SetSubscriber = Symbol('SetSubscriber');

export function unwrapProxy<T>(proxy: T): T {
  if (proxy && typeof proxy == 'object') {
    const value = (proxy as any)[QOjectTargetSymbol];
    if (value) return value;
  }
  return proxy;
}

export function wrap<T>(value: T, proxyMap: ObjToProxyMap): T {
  if (value && typeof value === 'object') {
    if (isQrl(value)) {
      return value;
    }
    if (isElement(value)) {
      return value;
    }
    const nakedValue = unwrapProxy(value);
    if (nakedValue !== value) {
      // already a proxy return;
      return value;
    }
    if (qDev) {
      verifySerializable<T>(value);
    }
    const proxy = proxyMap.get(value);
    return proxy ? proxy : readWriteProxy(value as any, proxyMap);
  } else {
    return value;
  }
}

type TargetType = Record<string | symbol, any>;

class ReadWriteProxyHandler implements ProxyHandler<TargetType> {
  private subscriber?: Subscriber;
  constructor(private proxyMap: ObjToProxyMap, private subs = new Map<Subscriber, Set<string>>()) {}

  getSub(el: Subscriber) {
    let sub = this.subs.get(el);
    if (!sub) {
      this.subs.set(el, (sub = new Set()));
    }
    return sub;
  }

  get(target: TargetType, prop: string | symbol): any {
    let subscriber = this.subscriber;
    this.subscriber = undefined;
    if (prop === QOjectTargetSymbol) return target;
    if (prop === QOjectSubsSymbol) return this.subs;
    if (prop === QOjectOriginalProxy) return this.proxyMap.get(target);
    const value = target[prop];
    if (typeof prop === 'symbol') {
      return value;
    }
    const invokeCtx = tryGetInvokeContext();
    if (qDev && !invokeCtx && !qTest) {
      logWarn(`State assigned outside invocation context. Getting prop "${prop}" of:`, target);
    }
    if (invokeCtx) {
      if (invokeCtx.subscriber === null) {
        subscriber = undefined;
      } else if (!subscriber) {
        subscriber = invokeCtx.subscriber;
      }
    } else if (qDev && !qTest && !subscriber) {
      logWarn(`State assigned outside invocation context. Getting prop "${prop}" of:`, target);
    }

    if (subscriber) {
      const isArray = Array.isArray(target);
      const sub = this.getSub(subscriber);
      if (!isArray) {
        sub.add(prop);
      }
    }
    return wrap(value, this.proxyMap);
  }

  set(target: TargetType, prop: string | symbol, newValue: any): boolean {
    if (typeof prop === 'symbol') {
      if (prop === SetSubscriber) {
        this.subscriber = newValue;
      } else {
        target[prop] = newValue;
      }
      return true;
    }
    const subs = this.subs;
    const unwrappedNewValue = unwrapProxy(newValue);
    verifySerializable(unwrappedNewValue);
    const isArray = Array.isArray(target);
    if (isArray) {
      target[prop as any] = unwrappedNewValue;
      subs.forEach((_, sub) => {
        if (sub.isConnected) {
          notifyChange(sub);
        } else {
          subs.delete(sub);
        }
      });
      return true;
    }
    const oldValue = target[prop];
    if (oldValue !== unwrappedNewValue) {
      target[prop] = unwrappedNewValue;
      subs.forEach((propSets, sub) => {
        if (sub.isConnected) {
          if (propSets.has(prop)) {
            notifyChange(sub);
          }
        } else {
          subs.delete(sub);
        }
      });
    }
    return true;
  }

  has(target: TargetType, property: string | symbol) {
    if (property === QOjectTargetSymbol) return true;
    if (property === QOjectSubsSymbol) return true;

    return Object.prototype.hasOwnProperty.call(target, property);
  }

  ownKeys(target: TargetType): ArrayLike<string | symbol> {
    return Object.getOwnPropertyNames(target);
  }
}

export function removeSub(obj: any, subscriber: any) {
  if (obj && typeof obj === 'object') {
    const subs = obj[QOjectSubsSymbol] as Map<Subscriber, Set<string>> | undefined;
    if (subs) {
      subs.delete(subscriber);
    }
  }
}

export function notifyChange(subscriber: Subscriber) {
  if (isElement(subscriber)) {
    notifyRender(subscriber);
  } else {
    notifyWatch(subscriber as WatchDescriptor);
  }
}

export function notifyWatch(watch: WatchDescriptor) {
  const containerEl = getContainer(watch.hostElement)!;
  const state = getRenderingState(containerEl);
  watch.dirty = true;
  if (watch.mode === WatchMode.Watch) {
    const promise = runWatch(watch);
    state.watchRunning.add(promise);
    promise.then(() => {
      state.watchRunning.delete(promise);
    });
  } else {
    const activeRendering = state.hostsRendering !== undefined;
    if (activeRendering) {
      state.watchStagging.add(watch);
    } else {
      state.watchNext.add(watch);
      scheduleFrame(containerEl, state);
    }
  }
}

export async function waitForWatches(state: RenderingState) {
  while (state.watchRunning.size > 0) {
    await Promise.all(state.watchRunning);
  }
}

function verifySerializable<T>(value: T) {
  if (shouldSerialize(value) && typeof value == 'object' && value !== null) {
    if (Array.isArray(value)) return;
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      if (isQrl(value)) return;
      if (isElement(value)) return;
      throw qError(QError.TODO, 'Only primitive and object literals can be serialized.');
    }
  }
}

const NOSERIALIZE = Symbol('NoSerialize');

export function shouldSerialize(obj: any): boolean {
  if (obj !== null && (typeof obj == 'object' || typeof obj === 'function')) {
    const noSerialize = (obj as any)[NOSERIALIZE] === true;
    return !noSerialize;
  }
  return true;
}

/**
 * @alpha
 */
export type NoSerialize<T> = (T & { [NOSERIALIZE]: true }) | undefined;

/**
 * @alpha
 */
export function noSerialize<T extends {}>(input: T): NoSerialize<T> {
  (input as any)[NOSERIALIZE] = true;
  return input as any;
}
