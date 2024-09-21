import type { ObjToProxyMap } from '../container/container';
import { assertEqual, assertNumber, assertTrue } from '../error/assert';
import { QError_immutableProps, qError } from '../error/error';
import { tryGetInvokeContext } from '../use/use-core';
import { logError, logWarn } from '../util/log';
import { ComputedEvent, RenderEvent } from '../util/markers';
import { qDev, qSerialize } from '../util/qdev';
import { isArray, isObject, isSerializableObject } from '../util/types';
import { SERIALIZER_PROXY_UNWRAP, SerializationConstant } from '../v2/shared/shared-serialization';
import {
  LocalSubscriptionManager,
  fastSkipSerialize,
  unwrapProxy,
  verifySerializable,
  type Subscriber,
  type SubscriptionManager,
  type Subscriptions,
} from './common';
import {
  QObjectFlagsSymbol,
  QObjectImmutable,
  QObjectManagerSymbol,
  QObjectRecursive,
  QObjectTargetSymbol,
  _CONST_PROPS,
} from './constants';
import { isSignalV1 } from './signal';

export interface StoreTracker {
  $proxyMap$: ObjToProxyMap;
  $subsManager$: SubscriptionManager;
  $getObjectById$: (id: string | number) => any;
}

export type QObject<T extends {}> = T & { __brand__: 'QObject' };

/** Creates a proxy that notifies of any writes. */
export const getOrCreateProxy = <T extends object>(
  target: T,
  storeMgr: StoreTracker,
  flags = 0
): T => {
  const proxy = storeMgr.$proxyMap$.get(target);
  if (proxy) {
    return proxy;
  }
  if (flags !== 0) {
    setObjectFlags(target, flags);
  }
  return createProxy(target, storeMgr, undefined);
};

export const isStore = (target: any): boolean => {
  const unwrap = unwrapProxy(target);
  return unwrap !== target;
};

export const createProxy = <T extends object>(
  target: T,
  storeTracker: StoreTracker,
  subs?: Subscriptions[]
): T => {
  assertEqual(unwrapProxy(target), target, 'Unexpected proxy at this location', target);
  assertTrue(!storeTracker.$proxyMap$.has(target), 'Proxy was already created', target);
  assertTrue(isObject(target), 'Target must be an object');
  assertTrue(
    isSerializableObject(target) || isArray(target),
    'Target must be a serializable object'
  );

  const manager = storeTracker.$subsManager$.$createManager$(subs);

  const getSerializedState = (target: object): string | undefined => {
    return (target as any)[SerializationConstant.Store_CHAR];
  };
  const subscriptionManagerFromString: any = null!;
  const removeSerializedState = (target: object) => {
    delete (target as any)[SerializationConstant.Store_CHAR];
  };
  const addSubscriptions = (
    serializedState: string,
    serializedStateObject: object,
    target: object
  ) => {
    removeSerializedState(serializedStateObject);
    setObjectFlags(target, serializedState.charCodeAt(0) - 48 /*'0'*/);
    subscriptionManagerFromString(
      manager,
      serializedState.substring(1),
      storeTracker.$getObjectById$
    );
  };

  /**
   * If we have an `SerializationConstant.UNDEFINED_CHAR` as a prop, then this means that this is
   * serialized store with an array as a value. We need to handle this separately, because the proxy
   * target is now the value of the `SerializationConstant.UNDEFINED_CHAR` prop
   */
  const serializedArrayTarget = (target as any)[SerializationConstant.UNDEFINED_CHAR];
  if (serializedArrayTarget) {
    const proxy = new Proxy(
      serializedArrayTarget,
      new ReadWriteProxyHandler(storeTracker, manager)
    ) as T;
    storeTracker.$proxyMap$.set(target, proxy);
    const serializedState = getSerializedState(target);
    if (serializedState) {
      addSubscriptions(serializedState, target, serializedArrayTarget);
    }
    return proxy;
  } else {
    const proxy = new Proxy(target, new ReadWriteProxyHandler(storeTracker, manager)) as T;
    storeTracker.$proxyMap$.set(target, proxy);
    const serializedState = getSerializedState(target);
    if (serializedState) {
      addSubscriptions(serializedState, target, target);
    }
    return proxy;
  }
};

export const createPropsState = (): Record<string, any> => {
  const props = {};
  setObjectFlags(props, QObjectImmutable);
  return props;
};

export const setObjectFlags = (obj: object, flags: number) => {
  Object.defineProperty(obj, QObjectFlagsSymbol, { value: flags, enumerable: false });
};

export type TargetType = Record<string | symbol, any>;

/** @internal */
export const _restProps = (props: Record<string, any>, omit: string[], target = {}) => {
  for (const key in props) {
    if (!omit.includes(key)) {
      (target as any)[key] = props[key];
    }
  }
  return target;
};

export class ReadWriteProxyHandler implements ProxyHandler<TargetType> {
  constructor(
    private $storeTracker$: StoreTracker,
    private $manager$: LocalSubscriptionManager
  ) {}

  deleteProperty(target: TargetType, prop: string | symbol): boolean {
    if (target[QObjectFlagsSymbol] & QObjectImmutable) {
      throw qError(QError_immutableProps);
    }
    if (typeof prop != 'string' || !delete target[prop]) {
      return false;
    }
    this.$manager$.$notifySubs$(isArray(target) ? undefined : prop);
    return true;
  }

  get(target: TargetType, prop: string | symbol): any {
    if (typeof prop === 'symbol') {
      if (prop === QObjectTargetSymbol) {
        return target;
      }
      if (prop === QObjectManagerSymbol) {
        return this.$manager$;
      }
      if (prop === SERIALIZER_PROXY_UNWRAP) {
        // SERIALIZER_PROXY_UNWRAP is used by v2 serialization to unwrap proxies.
        // Our target may be a v2 serialization proxy so if we let it through
        // we will return the naked object which removes ourselves,
        // and that is not the intention so prevent of SERIALIZER_PROXY_UNWRAP.
        return undefined;
      }
      return target[prop];
    }
    const flags = target[QObjectFlagsSymbol] ?? 0;
    assertNumber(flags, 'flags must be an number');
    const invokeCtx = tryGetInvokeContext();
    const recursive = (flags & QObjectRecursive) !== 0;
    const immutable = (flags & QObjectImmutable) !== 0;
    let subscriber: Subscriber | undefined | null;
    if (invokeCtx) {
      subscriber = invokeCtx.$subscriber$;
    }
    if (immutable && (!(prop in target) || immutableValue(target[_CONST_PROPS]?.[prop]))) {
      subscriber = null;
    }
    const value = target[prop];
    if (subscriber) {
      const isA = isArray(target);
      this.$manager$.$addSub$(subscriber, isA ? undefined : prop);
    }
    return recursive ? wrap(value, this.$storeTracker$) : value;
  }

  set(target: TargetType, prop: string | symbol, newValue: any): boolean {
    // we need deserializer proxy only to get the value, not to set it
    // target = unwrapDeserializerProxy(target) as TargetType;
    if (typeof prop === 'symbol') {
      target[prop] = newValue;
      return true;
    }
    const flags = target[QObjectFlagsSymbol] ?? 0;
    assertNumber(flags, 'flags must be an number');
    const immutable = (flags & QObjectImmutable) !== 0;
    if (immutable) {
      throw qError(QError_immutableProps);
    }
    const recursive = (flags & QObjectRecursive) !== 0;
    const unwrappedNewValue = recursive ? unwrapProxy(newValue) : newValue;
    if (qDev) {
      if (qSerialize) {
        verifySerializable(unwrappedNewValue);
      }
      const invokeCtx = tryGetInvokeContext();
      if (invokeCtx) {
        if (invokeCtx.$event$ === RenderEvent) {
          logError(
            'State mutation inside render function. Move mutation to useTask$() or useVisibleTask$()',
            prop
          );
        } else if (invokeCtx.$event$ === ComputedEvent) {
          logWarn(
            'State mutation inside useComputed$() is an antipattern. Use useTask$() instead',
            String(invokeCtx.$hostElement$)
          );
        }
      }
    }
    const isA = isArray(target);
    if (isA) {
      target[prop as any] = unwrappedNewValue;
      this.$manager$.$notifySubs$();
      return true;
    }

    const oldValue = target[prop];
    target[prop] = unwrappedNewValue;
    if (oldValue !== unwrappedNewValue) {
      this.$manager$.$notifySubs$(prop);
    }
    return true;
  }

  has(target: TargetType, property: string | symbol): boolean {
    if (property === QObjectTargetSymbol) {
      return true;
    }
    const hasOwnProperty = Object.prototype.hasOwnProperty;
    if (hasOwnProperty.call(target, property)) {
      return true;
    }
    return false;
  }

  ownKeys(target: TargetType): ArrayLike<string | symbol> {
    const flags = target[QObjectFlagsSymbol] ?? 0;
    assertNumber(flags, 'flags must be an number');
    const immutable = (flags & QObjectImmutable) !== 0;
    if (!immutable) {
      let subscriber: Subscriber | null | undefined = null;
      const invokeCtx = tryGetInvokeContext();
      if (invokeCtx) {
        subscriber = invokeCtx.$subscriber$;
      }
      if (subscriber) {
        this.$manager$.$addSub$(subscriber);
      }
    }
    return Reflect.ownKeys(target);
  }

  getOwnPropertyDescriptor(
    target: TargetType,
    prop: string | symbol
  ): PropertyDescriptor | undefined {
    if (isArray(target) || typeof prop === 'symbol') {
      return Object.getOwnPropertyDescriptor(target, prop);
    }
    return {
      enumerable: true,
      configurable: true,
    };
  }
}

const immutableValue = (value: any) => {
  return value === _CONST_PROPS || isSignalV1(value);
};

const wrap = <T>(value: T, storeTracker: StoreTracker): T => {
  if (isObject(value)) {
    if (Object.isFrozen(value)) {
      return value;
    }
    const nakedValue = unwrapProxy(value);
    if (nakedValue !== value) {
      // already a proxy return;
      return value;
    }
    if (fastSkipSerialize(nakedValue)) {
      return value;
    }
    if (isSerializableObject(nakedValue) || isArray(nakedValue)) {
      const proxy = storeTracker.$proxyMap$.get(nakedValue);
      return proxy ? proxy : getOrCreateProxy(nakedValue as any, storeTracker, QObjectRecursive);
    }
  }
  return value;
};
