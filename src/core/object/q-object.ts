import { assertEqual } from '../assert/assert';
import { QError, qError } from '../error/error';
import { isQrl } from '../import/qrl-class';
import { notifyRender } from '../render/notify-render';
import { tryGetInvokeContext } from '../use/use-core';
import { isElement } from '../util/element';
import { logWarn } from '../util/log';
import { qDev, qTest } from '../util/qdev';
import { debugStringify } from '../util/stringify';
import { runWatch, WatchDescriptor } from '../watch/watch.public';

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
  private subscriber?: Element;
  constructor(
    private proxyMap: ObjToProxyMap,
    private subs = new Map<Element | WatchDescriptor, Set<string>>()
  ) {}

  getSub(el: Element) {
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
    if (!subscriber) {
      const invokeCtx = tryGetInvokeContext();
      if (qDev && !invokeCtx && !qTest) {
        logWarn(`State assigned outside invocation context. Getting prop "${prop}" of:`, target);
      }
      if (invokeCtx && invokeCtx.subscriptions && invokeCtx.hostElement) {
        subscriber = invokeCtx.hostElement;
      }
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
    const unwrappedNewValue = unwrapProxy(newValue);
    verifySerializable(unwrappedNewValue);
    const isArray = Array.isArray(target);
    if (isArray) {
      target[prop as any] = unwrappedNewValue;
      this.subs.forEach((_, sub) => notifyChange(sub));
      return true;
    }
    const oldValue = target[prop];
    if (oldValue !== unwrappedNewValue) {
      target[prop] = unwrappedNewValue;
      this.subs.forEach((propSets, sub) => {
        if (propSets.has(prop)) {
          notifyChange(sub);
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

export function notifyChange(subscriber: Element | WatchDescriptor) {
  if (isElement(subscriber)) {
    notifyRender(subscriber);
  } else {
    runWatch(subscriber as WatchDescriptor);
  }
}

function verifySerializable<T>(value: T) {
  if (shouldSerialize(value) && typeof value == 'object' && value !== null) {
    if (Array.isArray(value)) return;
    if (isQrl(value)) return;
    if (Object.getPrototypeOf(value) !== Object.prototype) {
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
