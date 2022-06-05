import { assertEqual } from '../assert/assert';
import { QError, qError } from '../error/error';
import { isQrl } from '../import/qrl-class';
import {
  getContainerState,
  notifyRender,
  ContainerState,
  scheduleFrame,
} from '../render/notify-render';
import { getContainer, tryGetInvokeContext } from '../use/use-core';
import { isDocument, isElement, isNode } from '../util/element';
import { logWarn } from '../util/log';
import { qDev, qTest } from '../util/qdev';
import { debugStringify } from '../util/stringify';
import { WatchDescriptor, WatchFlags } from '../watch/watch.public';
import { Subscriber, unwrapSubscriber } from '../use/use-subscriber';
import { tryGetContext } from '../props/props';
import { RenderEvent } from '../util/markers';
import { getProxyTarget } from './store';

export type ObjToProxyMap = WeakMap<any, any>;
export type QObject<T extends {}> = T & { __brand__: 'QObject' };

export function qObject<T extends Object>(obj: T, proxyMap: ContainerState): T {
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

export function _restoreQObject<T>(
  obj: T,
  containerState: ContainerState,
  subs: Map<Element, Set<string>>
): T {
  return readWriteProxy(obj as any as QObject<T>, containerState, subs);
}

/**
 * Creates a proxy which notifies of any writes.
 */
export function readWriteProxy<T extends object>(
  target: T,
  containerState: ContainerState,
  subs?: Map<Element, Set<string>>
): T {
  if (!target || typeof target !== 'object') return target;
  const proxyMap = containerState.proxyMap;
  let proxy = proxyMap.get(target);
  if (proxy) return proxy;

  const manager = containerState.subsManager.getLocal(target, subs);
  proxy = new Proxy(target, new ReadWriteProxyHandler(containerState, manager)) as any as T;
  proxyMap.set(target, proxy);
  return proxy;
}

export const QOjectTargetSymbol = ':target:';
export const QOjectAllSymbol = ':all:';
export const QOjectSubsSymbol = ':subs:';
export const QOjectOriginalProxy = ':proxy:';
export const SetSubscriber = Symbol('SetSubscriber');

/**
 * @alpha
 */
export function unwrapProxy<T>(proxy: T): T {
  return getProxyTarget(proxy) ?? proxy;
}

export function wrap<T>(value: T, containerState: ContainerState): T {
  if (value && typeof value === 'object') {
    if (isQrl(value)) {
      return value;
    }
    if (Object.isFrozen(value)) {
      return value;
    }
    const nakedValue = unwrapProxy(value);
    if (nakedValue !== value) {
      // already a proxy return;
      return value;
    }
    if (isNode(nakedValue)) {
      return value;
    }
    if (!shouldSerialize(nakedValue)) {
      return value;
    }
    if (qDev) {
      verifySerializable<T>(value);
    }
    const proxy = containerState.proxyMap.get(value);
    return proxy ? proxy : readWriteProxy(value as any, containerState);
  } else {
    return value;
  }
}

export type TargetType = Record<string | symbol, any>;

export type SubscriberMap = Map<Subscriber, Set<string> | null>;
export type ObjToSubscriberMap = WeakMap<any, LocalSubscriptionManager>;
export type SubscriberToSubscriberMap = Map<Subscriber, Set<SubscriberMap>>;

export interface SubscriptionManager {
  tryGetLocal(obj: any): LocalSubscriptionManager | undefined;
  getLocal(obj: any, map?: SubscriberMap): LocalSubscriptionManager;
  clearSub: (sub: Subscriber) => void;
}

export interface LocalSubscriptionManager {
  subs: SubscriberMap;
  notifySubs: (key?: string | undefined) => void;
  addSub: (subscriber: Subscriber, key?: string) => void;
}

export const createSubscriptionManager = (): SubscriptionManager => {
  const objToSubs: ObjToSubscriberMap = new Map();
  const subsToObjs: SubscriberToSubscriberMap = new Map();

  function clearSub(sub: Subscriber) {
    const subs = subsToObjs.get(sub);
    if (subs) {
      subs.forEach((s) => {
        s.delete(sub);
      });
      subsToObjs.delete(sub);
      subs.clear();
    }
  }

  function tryGetLocal(obj: any) {
    assertEqual(getProxyTarget(obj), undefined);
    return objToSubs.get(obj);
  }

  function trackSubToObj(subscriber: Subscriber, map: SubscriberMap) {
    let set = subsToObjs.get(subscriber);
    if (!set) {
      subsToObjs.set(subscriber, (set = new Set()));
    }
    set.add(map);
  }

  function getLocal(obj: any, initialMap?: SubscriberMap) {
    let local = tryGetLocal(obj);
    if (!local) {
      const map = !initialMap ? (new Map() as SubscriberMap) : initialMap;
      map.forEach((_, key) => {
        trackSubToObj(key, map);
      });
      objToSubs.set(
        obj,
        (local = {
          subs: map,
          addSub(subscriber: Subscriber, key?: string) {
            if (key == null) {
              map.set(subscriber, null);
            } else {
              let sub = map.get(subscriber);
              if (sub === undefined) {
                map.set(subscriber, (sub = new Set()));
              }
              if (sub) {
                sub.add(key);
              }
            }
            trackSubToObj(subscriber, map);
          },
          notifySubs(key?: string) {
            map.forEach((value, subscriber) => {
              if (value === null || !key) {
                notifyChange(subscriber);
              } else if (value.has(key)) {
                notifyChange(subscriber);
              }
            });
          },
        })
      );
    }
    return local;
  }

  return {
    tryGetLocal,
    getLocal,
    clearSub,
  };
};

class ReadWriteProxyHandler implements ProxyHandler<TargetType> {
  private subscriber?: Subscriber;
  constructor(private containerState: ContainerState, private manager: LocalSubscriptionManager) {}

  get(target: TargetType, prop: string | symbol): any {
    let subscriber = this.subscriber;
    this.subscriber = undefined;
    if (typeof prop === 'symbol') {
      return target[prop];
    }
    if (prop === QOjectTargetSymbol) return target;
    if (prop === QOjectSubsSymbol) return this.manager.subs;
    if (prop === QOjectOriginalProxy) return this.containerState.proxyMap.get(target);
    const invokeCtx = tryGetInvokeContext();
    if (invokeCtx) {
      if (invokeCtx.subscriber === null) {
        subscriber = undefined;
      } else if (!subscriber) {
        subscriber = invokeCtx.subscriber;
      }
    } else if (qDev && !qTest && !subscriber) {
      // logWarn(`State assigned outside invocation context. Getting prop "${prop}" of:`, target);
    }

    if (prop === QOjectAllSymbol) {
      if (subscriber) {
        this.manager.addSub(subscriber);
      }
      return target;
    }

    const value = target[prop];
    if (typeof prop === 'symbol') {
      return value;
    }

    if (subscriber) {
      const isArray = Array.isArray(target);
      this.manager.addSub(subscriber, isArray ? undefined : prop);
    }
    return wrap(value, this.containerState);
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
    if (qDev) {
      verifySerializable(unwrappedNewValue);
      const invokeCtx = tryGetInvokeContext();
      if (invokeCtx && invokeCtx.event === RenderEvent) {
        logWarn(
          'State mutation inside render function. Move mutation to useWatch(), useClientEffect() or useServerMount()',
          invokeCtx.hostElement,
          prop
        );
      }
    }
    const isArray = Array.isArray(target);
    if (isArray) {
      target[prop as any] = unwrappedNewValue;
      this.manager.notifySubs();
      return true;
    }

    const oldValue = target[prop];
    if (oldValue !== unwrappedNewValue) {
      target[prop] = unwrappedNewValue;
      this.manager.notifySubs(prop);
    }
    return true;
  }

  has(target: TargetType, property: string | symbol) {
    if (property === QOjectTargetSymbol) return true;
    if (property === QOjectSubsSymbol) return true;

    return Object.prototype.hasOwnProperty.call(target, property);
  }

  ownKeys(target: TargetType): ArrayLike<string | symbol> {
    let subscriber = this.subscriber;
    const invokeCtx = tryGetInvokeContext();
    if (invokeCtx) {
      if (invokeCtx.subscriber === null) {
        subscriber = undefined;
      } else if (!subscriber) {
        subscriber = invokeCtx.subscriber;
      }
    } else if (qDev && !qTest && !subscriber) {
      // logWarn(`State assigned outside invocation context. OwnKeys of:`, target);
    }

    if (subscriber) {
      this.manager.addSub(subscriber);
    }
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
  const containerEl = getContainer(watch.el)!;
  const state = getContainerState(containerEl);
  watch.f |= WatchFlags.IsDirty;

  const activeRendering = state.hostsRendering !== undefined;
  if (activeRendering) {
    state.watchStaging.add(watch);
  } else {
    state.watchNext.add(watch);
    scheduleFrame(containerEl, state);
  }
}

function verifySerializable<T>(value: T) {
  if (value == null) {
    return null;
  }
  if (shouldSerialize(value)) {
    const type = typeof value;
    if (type === 'object') {
      if (Array.isArray(value)) return;
      if (Object.getPrototypeOf(value) === Object.prototype) return;
      if (isQrl(value)) return;
      if (isElement(value)) return;
      if (isDocument(value)) return;
    }
    if (['boolean', 'string', 'number'].includes(type)) {
      return;
    }
    throw qError(QError.TODO, 'Only primitive and object literals can be serialized', value);
  }
}

const noSerializeSet = /*#__PURE__*/ new WeakSet<any>();

export function shouldSerialize(obj: any): boolean {
  if (obj !== null && (typeof obj == 'object' || typeof obj === 'function')) {
    return !noSerializeSet.has(obj);
  }
  return true;
}

/**
 * @alpha
 */
export type NoSerialize<T> = (T & { __no_serialize__: true }) | undefined;

// <docs markdown="../readme.md#noSerialize">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#noSerialize instead)
/**
 * @alpha
 */
// </docs>
export function noSerialize<T extends {}>(input: T): NoSerialize<T> {
  noSerializeSet.add(input);
  return input as any;
}

/**
 * @alpha
 */
export function immutable<T extends {}>(input: T): Readonly<T> {
  return Object.freeze(input);
}

/**
 * @alpha
 */
export function mutable<T>(v: T): MutableWrapper<T> {
  return {
    [MUTABLE]: true,
    v: unwrapSubscriber(v),
  };
}

export function isConnected(sub: Subscriber): boolean {
  if (isElement(sub)) {
    return !!tryGetContext(sub) || sub.isConnected;
  } else {
    return isConnected(sub.el);
  }
}

const MUTABLE = Symbol('mutable');

export interface MutableWrapper<T> {
  [MUTABLE]: true;
  v: T;
}

export const isMutable = (v: any): v is MutableWrapper<any> => {
  return v && typeof v === 'object' && v[MUTABLE] === true;
};
