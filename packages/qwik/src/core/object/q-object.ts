import { assertEqual } from '../assert/assert';
import {
  qError,
  QError_immutableProps,
  QError_onlyLiteralWrapped,
  QError_onlyObjectWrapped,
  QError_verifySerializable,
} from '../error/error';
import { isQrl } from '../import/qrl-class';
import { ContainerState, notifyChange } from '../render/notify-render';
import { tryGetInvokeContext } from '../use/use-core';
import { isDocument, isElement, isNode } from '../util/element';
import { logWarn } from '../util/log';
import { qDev } from '../util/qdev';
import type { Subscriber } from '../use/use-subscriber';
import { tryGetContext } from '../props/props';
import { RenderEvent } from '../util/markers';
import { isArray, isFunction, isObject } from '../util/types';
import { isPromise } from '../util/promises';

export type ObjToProxyMap = WeakMap<any, any>;
export type QObject<T extends {}> = T & { __brand__: 'QObject' };

export const QObjectRecursive = 1 << 0;
export const QObjectImmutable = 1 << 1;

/**
 * Creates a proxy that notifies of any writes.
 */
export const getOrCreateProxy = <T extends object>(
  target: T,
  containerState: ContainerState,
  flags = 0
): T => {
  const proxy = containerState.$proxyMap$.get(target);
  if (proxy) {
    return proxy;
  }
  return createProxy(target, containerState, flags, undefined);
};

export const createProxy = <T extends object>(
  target: T,
  containerState: ContainerState,
  flags: number,
  subs?: Map<Element, Set<string>>
): T => {
  assertEqual(unwrapProxy(target), target, 'Unexpected proxy at this location');
  assertEqual(containerState.$proxyMap$.has(target), false, 'Proxy was already created');

  if (!isObject(target)) {
    throw qError(QError_onlyObjectWrapped, target);
  }
  if (target.constructor !== Object && !isArray(target)) {
    throw qError(QError_onlyLiteralWrapped, target);
  }

  const manager = containerState.$subsManager$.$getLocal$(target, subs);
  const proxy = new Proxy(
    target,
    new ReadWriteProxyHandler(containerState, manager, flags)
  ) as any as T;
  containerState.$proxyMap$.set(target, proxy);
  return proxy;
};

const QOjectTargetSymbol = Symbol();
const QOjectFlagsSymbol = Symbol();

export type TargetType = Record<string | symbol, any>;

export type SubscriberMap = Map<Subscriber, Set<string> | null>;
export type ObjToSubscriberMap = WeakMap<any, LocalSubscriptionManager>;
export type SubscriberToSubscriberMap = Map<Subscriber, Set<SubscriberMap>>;

export interface SubscriptionManager {
  $tryGetLocal$(obj: any): LocalSubscriptionManager | undefined;
  $getLocal$(obj: any, map?: SubscriberMap): LocalSubscriptionManager;
  $clearSub$: (sub: Subscriber) => void;
}

export interface LocalSubscriptionManager {
  $subs$: SubscriberMap;
  $notifySubs$: (key?: string | undefined) => void;
  $addSub$: (subscriber: Subscriber, key?: string) => void;
}

export const createSubscriptionManager = (): SubscriptionManager => {
  const objToSubs: ObjToSubscriberMap = new Map();
  const subsToObjs: SubscriberToSubscriberMap = new Map();

  const clearSub = (sub: Subscriber) => {
    const subs = subsToObjs.get(sub);
    if (subs) {
      subs.forEach((s) => {
        s.delete(sub);
      });
      subsToObjs.delete(sub);
      subs.clear();
    }
  };

  const tryGetLocal = (obj: any) => {
    assertEqual(getProxyTarget(obj), undefined, 'object can not be be a proxy');
    return objToSubs.get(obj);
  };

  const trackSubToObj = (subscriber: Subscriber, map: SubscriberMap) => {
    let set = subsToObjs.get(subscriber);
    if (!set) {
      subsToObjs.set(subscriber, (set = new Set()));
    }
    set.add(map);
  };

  const getLocal = (obj: any, initialMap?: SubscriberMap) => {
    let local = tryGetLocal(obj);
    if (local) {
      assertEqual(initialMap, undefined, 'subscription map can not be set to an existing object');
    } else {
      const map = !initialMap ? (new Map() as SubscriberMap) : initialMap;
      map.forEach((_, key) => {
        trackSubToObj(key, map);
      });
      objToSubs.set(
        obj,
        (local = {
          $subs$: map,
          $addSub$(subscriber: Subscriber, key?: string) {
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
          $notifySubs$(key?: string) {
            map.forEach((value, subscriber) => {
              if (value === null || !key || value.has(key)) {
                notifyChange(subscriber);
              }
            });
          },
        })
      );
    }
    return local;
  };

  return {
    $tryGetLocal$: tryGetLocal,
    $getLocal$: getLocal,
    $clearSub$: clearSub,
  };
};

class ReadWriteProxyHandler implements ProxyHandler<TargetType> {
  constructor(
    private $containerState$: ContainerState,
    private $manager$: LocalSubscriptionManager,
    private $flags$: number
  ) {}

  get(target: TargetType, prop: string | symbol): any {
    if (typeof prop === 'symbol') {
      if (prop === QOjectTargetSymbol) return target;
      if (prop === QOjectFlagsSymbol) return this.$flags$;
      return target[prop];
    }
    let subscriber: Subscriber | undefined | null;
    const invokeCtx = tryGetInvokeContext();
    const recursive = (this.$flags$ & QObjectRecursive) !== 0;
    const immutable = (this.$flags$ & QObjectImmutable) !== 0;
    if (invokeCtx) {
      subscriber = invokeCtx.$subscriber$;
    }
    let value = target[prop];
    if (isMutable(value)) {
      value = value.v;
    } else if (immutable) {
      subscriber = null;
    }
    if (subscriber) {
      const isA = isArray(target);
      this.$manager$.$addSub$(subscriber, isA ? undefined : prop);
    }
    return recursive ? wrap(value, this.$containerState$) : value;
  }

  set(target: TargetType, prop: string | symbol, newValue: any): boolean {
    if (typeof prop === 'symbol') {
      target[prop] = newValue;
      return true;
    }
    const immutable = (this.$flags$ & QObjectImmutable) !== 0;
    if (immutable) {
      throw qError(QError_immutableProps);
    }
    const recursive = (this.$flags$ & QObjectRecursive) !== 0;
    const unwrappedNewValue = recursive ? unwrapProxy(newValue) : newValue;
    if (qDev) {
      verifySerializable(unwrappedNewValue);
      const invokeCtx = tryGetInvokeContext();
      if (invokeCtx && invokeCtx.$event$ === RenderEvent) {
        logWarn(
          'State mutation inside render function. Move mutation to useWatch(), useClientEffect() or useServerMount()',
          invokeCtx.$hostElement$,
          prop
        );
      }
    }
    const isA = isArray(target);
    if (isA) {
      target[prop as any] = unwrappedNewValue;
      this.$manager$.$notifySubs$();
      return true;
    }

    const oldValue = target[prop];
    if (oldValue !== unwrappedNewValue) {
      target[prop] = unwrappedNewValue;
      this.$manager$.$notifySubs$(prop);
    }
    return true;
  }

  has(target: TargetType, property: string | symbol) {
    if (property === QOjectTargetSymbol) return true;
    if (property === QOjectFlagsSymbol) return true;

    return Object.prototype.hasOwnProperty.call(target, property);
  }

  ownKeys(target: TargetType): ArrayLike<string | symbol> {
    let subscriber: Subscriber | null | undefined = null;
    const invokeCtx = tryGetInvokeContext();
    if (invokeCtx) {
      subscriber = invokeCtx.$subscriber$;
    }
    if (subscriber) {
      this.$manager$.$addSub$(subscriber);
    }
    return Object.getOwnPropertyNames(target);
  }
}

const wrap = <T>(value: T, containerState: ContainerState): T => {
  if (isQrl(value)) {
    return value;
  }
  if (isObject(value)) {
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
    const proxy = containerState.$proxyMap$.get(value);
    return proxy ? proxy : getOrCreateProxy(value as any, containerState, QObjectRecursive);
  } else {
    return value;
  }
};

export const verifySerializable = <T>(value: T): T => {
  const seen = new Set();
  return _verifySerializable(value, seen);
};

const _verifySerializable = <T>(value: T, seen: Set<any>): T => {
  const unwrapped = unwrapProxy(value);
  if (unwrapped == null) {
    return value;
  }
  if (shouldSerialize(unwrapped)) {
    if (seen.has(unwrapped)) {
      return value;
    }
    seen.add(unwrapped);
    if (isQrl(unwrapped)) {
      return value;
    }
    switch (typeof unwrapped) {
      case 'object':
        if (isArray(unwrapped)) {
          for (const item of unwrapped) {
            _verifySerializable(item, seen);
          }
          return value;
        }
        if (Object.getPrototypeOf(unwrapped) === Object.prototype) {
          for (const item of Object.values(unwrapped)) {
            _verifySerializable(item, seen);
          }
          return value;
        }
        if (isPromise(unwrapped)) return value;
        if (isElement(unwrapped)) return value;
        if (isDocument(unwrapped)) return value;
        break;
      case 'boolean':
      case 'string':
      case 'number':
        return value;
    }
    throw qError(QError_verifySerializable, unwrapped);
  }
  return value;
};
const noSerializeSet = /*#__PURE__*/ new WeakSet<any>();

export const shouldSerialize = (obj: any): boolean => {
  if (isObject(obj) || isFunction(obj)) {
    return !noSerializeSet.has(obj);
  }
  return true;
};

/**
 * @alpha
 */
export type NoSerialize<T> = (T & { __no_serialize__: true }) | undefined;

// <docs markdown="../readme.md#noSerialize">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#noSerialize instead)
/**
 * Marks a property on a store as non-serializable.
 *
 * At times it is necessary to store values on a store that are non-serializable. Normally this
 * is a runtime error as Store wants to eagerly report when a non-serializable property is
 * assigned to it.
 *
 * You can use `noSerialize()` to mark a value as non-serializable. The value is persisted in the
 * Store but does not survive serialization. The implication is that when your application is
 * resumed, the value of this object will be `undefined`. You will be responsible for recovering
 * from this.
 *
 * See: [noSerialize Tutorial](http://qwik.builder.io/tutorial/store/no-serialize)
 *
 * @alpha
 */
// </docs>
export const noSerialize = <T extends {}>(input: T): NoSerialize<T> => {
  noSerializeSet.add(input);
  return input as any;
};

// <docs markdown="../readme.md#immutable">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#immutable instead)
/**
 * Mark an object as immutable, preventing Qwik from creating subscriptions on that object.
 *
 * Qwik automatically creates subscriptions on store objects created by `useStore()`. By marking
 * an object as `immutable`, it hints to Qwik that the properties of this object will not change,
 * and therefore there is no need to create subscriptions for those objects.
 *
 * @alpha
 */
// </docs>
export const immutable = <T extends {}>(input: T): Readonly<T> => {
  return Object.freeze(input);
};

// <docs markdown="../readme.md#mutable">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#mutable instead)
/**
 * Mark property as mutable.
 *
 * Qwik assumes that all bindings in components are immutable by default. This is done for two
 * reasons:
 *
 * 1. JSX does not allow Qwik runtime to know if a binding is static or mutable.
 *    `<Example valueA={123} valueB={exp}>` At runtime there is no way to know if `valueA` is
 * immutable.
 * 2. If Qwik assumes that properties are immutable, then it can do a better job data-shaking the
 * amount of code that needs to be serialized to the client.
 *
 * Because Qwik assumes that bindings are immutable by default, it needs a way for a developer to
 * let it know that binding is mutable. `mutable()` function serves that purpose.
 * `<Example valueA={123} valueB={mutable(exp)}>`. In this case, the Qwik runtime can correctly
 * recognize that the `Example` props are mutable and need to be serialized.
 *
 * See: [Mutable Props Tutorial](http://qwik.builder.io/tutorial/props/mutable) for an example
 *
 * @alpha
 */
// </docs>
export const mutable = <T>(v: T): MutableWrapper<T> => {
  return {
    [MUTABLE]: true,
    v,
  };
};

export const isConnected = (sub: Subscriber): boolean => {
  if (isElement(sub)) {
    return !!tryGetContext(sub) || sub.isConnected;
  } else {
    return isConnected(sub.el);
  }
};

const MUTABLE = Symbol('mutable');

// <docs markdown="../readme.md#MutableWrapper">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#MutableWrapper instead)
/**
 * A marker object returned by `mutable()` to identify that the binding is mutable.
 *
 * @alpha
 */
// </docs>
export interface MutableWrapper<T> {
  /**
   * A marker symbol.
   */
  [MUTABLE]: true;
  /**
   * Mutable value.
   */
  v: T;
}

export const isMutable = (v: any): v is MutableWrapper<any> => {
  return isObject(v) && v[MUTABLE] === true;
};

/**
 * @alpha
 */
export const unwrapProxy = <T>(proxy: T): T => {
  return getProxyTarget<T>(proxy) ?? proxy;
};

export const getProxyTarget = <T = Record<string, any>>(obj: T): T | undefined => {
  if (isObject(obj)) {
    return (obj as any)[QOjectTargetSymbol];
  }
  return undefined;
};

export const getProxyFlags = <T = Record<string, any>>(obj: T): number | undefined => {
  if (isObject(obj)) {
    return (obj as any)[QOjectFlagsSymbol];
  }
  return undefined;
};
