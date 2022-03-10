import { assertEqual } from '../assert/assert';
import { QError, qError } from '../error/error';
import { notifyRender } from '../render/notify-render';
import { tryGetInvokeContext } from '../use/use-core';
import { debugStringify } from '../util/stringify';

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
  const proxy = readWriteProxy(obj as any as QObject<T>, proxyMap);
  Object.assign((proxy as any)[QOjectTargetSymbol], obj);
  return proxy;
}

export function _restoreQObject<T>(obj: T, map: ObjToProxyMap, subs: Map<Element, Set<string>>): T {
  return readWriteProxy(obj as any as QObject<T>, map, subs);
}

export function getTransient<T>(obj: any, key: any): T | null {
  return obj[QOjectTransientsSymbol].get(key);
}

export function setTransient<T>(obj: any, key: any, value: T): T {
  obj[QOjectTransientsSymbol].set(key, value);
  return value;
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
const QOjectTransientsSymbol = ':transients:';
export const QObjectIdSymbol = ':id:';

export function unwrapProxy<T>(proxy: T): T {
  if (proxy && typeof proxy == 'object') {
    const value = (proxy as any)[QOjectTargetSymbol];
    if (value) return value;
  }
  return proxy;
}

export function wrap<T>(value: T, proxyMap: ObjToProxyMap): T {
  if (value && typeof value === 'object') {
    const nakedValue = unwrapProxy(value);
    if (nakedValue !== value) {
      // already a proxy return;
      return value;
    }
    verifySerializable<T>(value);

    const proxy = proxyMap.get(value);
    return proxy ? proxy : readWriteProxy(value as any, proxyMap);
  } else {
    return value;
  }
}

class ReadWriteProxyHandler<T extends object> implements ProxyHandler<T> {
  private transients: WeakMap<any, any> | null = null;

  constructor(private proxy: ObjToProxyMap, private subs = new Map<Element, Set<string>>()) {}

  getSub(el: Element) {
    let sub = this.subs.get(el);
    if (!sub) {
      this.subs.set(el, (sub = new Set()));
    }
    return sub;
  }

  get(target: T, prop: string): any {
    if (prop === QOjectTargetSymbol) return target;
    if (prop === QOjectSubsSymbol) return this.subs;
    if (prop === QOjectTransientsSymbol) {
      return this.transients || (this.transients = new WeakMap());
    }
    const value = (target as any)[prop];
    const invokeCtx = tryGetInvokeContext();
    if (invokeCtx && invokeCtx.subscriptions) {
      const isArray = Array.isArray(target);
      const sub = this.getSub(invokeCtx.hostElement);
      if (!isArray) {
        sub.add(prop);
      }
    }
    return wrap(value, this.proxy);
  }

  set(target: T, prop: string, newValue: any): boolean {
    const unwrappedNewValue = unwrapProxy(newValue);
    const isArray = Array.isArray(target);
    if (isArray) {
      (target as any)[prop] = unwrappedNewValue;
      this.subs.forEach((_, el) => {
        notifyRender(el);
      });
      return true;
    }
    const oldValue = (target as any)[prop];
    if (oldValue !== unwrappedNewValue) {
      (target as any)[prop] = unwrappedNewValue;
      this.subs.forEach((propSets, el) => {
        if (propSets.has(prop)) {
          notifyRender(el);
        }
      });
    }
    return true;
  }

  has(target: T, property: string | symbol) {
    if (property === QOjectTargetSymbol) return true;
    return Object.prototype.hasOwnProperty.call(target, property);
  }

  ownKeys(target: T): ArrayLike<string | symbol> {
    return Object.getOwnPropertyNames(target);
  }
}

function verifySerializable<T>(value: T) {
  if (typeof value == 'object' && value !== null) {
    if (Array.isArray(value)) return;
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw qError(QError.TODO, 'Only primitive and object literals can be serialized.');
    }
  }
}
