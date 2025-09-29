import { assertEqual, assertNumber, assertTrue } from '../error/assert';
import { qError, QError_immutableProps } from '../error/error';
import { tryGetInvokeContext } from '../use/use-core';
import { qDev, qSerialize } from '../util/qdev';
import { ComputedEvent, RenderEvent, ResourceEvent } from '../util/markers';
import { isArray, isObject, isSerializableObject } from '../util/types';
import type { ContainerState } from '../container/container';
import {
  fastSkipSerialize,
  LocalSubscriptionManager,
  type Subscriber,
  type Subscriptions,
  unwrapProxy,
  verifySerializable,
} from './common';
import { isSignal } from './signal';
import {
  QObjectFlagsSymbol,
  QObjectImmutable,
  QObjectManagerSymbol,
  QObjectRecursive,
  QOjectTargetSymbol,
  _IMMUTABLE,
  _IMMUTABLE_PREFIX,
} from './constants';
import { logError, logWarn } from '../util/log';

export type QObject<T extends {}> = T & { __brand__: 'QObject' };

/** Creates a proxy that notifies of any writes. */
export const getOrCreateProxy = <T extends object>(
  target: T,
  containerState: ContainerState,
  flags = 0
): T => {
  const proxy = containerState.$proxyMap$.get(target);
  if (proxy) {
    return proxy;
  }
  if (flags !== 0) {
    setObjectFlags(target, flags);
  }
  return createProxy(target, containerState, undefined);
};

export const createProxy = <T extends object>(
  target: T,
  containerState: ContainerState,
  subs?: Subscriptions[]
): T => {
  assertEqual(unwrapProxy(target), target, 'Unexpected proxy at this location', target);
  assertTrue(!containerState.$proxyMap$.has(target), 'Proxy was already created', target);
  assertTrue(isObject(target), 'Target must be an object');
  assertTrue(
    isSerializableObject(target) || isArray(target),
    'Target must be a serializable object'
  );

  const manager = containerState.$subsManager$.$createManager$(subs);
  const proxy = new Proxy(target, new ReadWriteProxyHandler(containerState, manager)) as any as T;
  containerState.$proxyMap$.set(target, proxy);
  return proxy;
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
export const _restProps = (props: Record<string, any>, omit: string[]) => {
  const rest: Record<string, any> = {};
  for (const key in props) {
    if (!omit.includes(key)) {
      rest[key] = props[key];
    }
  }
  return rest;
};

export class ReadWriteProxyHandler implements ProxyHandler<TargetType> {
  constructor(
    private $containerState$: ContainerState,
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
      if (prop === QOjectTargetSymbol) {
        return target;
      }
      if (prop === QObjectManagerSymbol) {
        return this.$manager$;
      }
      return target[prop];
    }
    const flags = target[QObjectFlagsSymbol] ?? 0;
    assertNumber(flags, 'flags must be an number');
    const invokeCtx = tryGetInvokeContext();
    const recursive = (flags & QObjectRecursive) !== 0;
    const immutable = (flags & QObjectImmutable) !== 0;
    const hiddenSignal = target[_IMMUTABLE_PREFIX + prop];
    let subscriber: Subscriber | undefined | null;
    let value;
    if (invokeCtx) {
      subscriber = invokeCtx.$subscriber$;
    }
    if (immutable && (!(prop in target) || immutableValue(target[_IMMUTABLE]?.[prop]))) {
      subscriber = null;
    }
    if (hiddenSignal) {
      assertTrue(isSignal(hiddenSignal), '$$ prop must be a signal');
      value = hiddenSignal.value;
      subscriber = null;
    } else {
      value = target[prop];
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
            invokeCtx.$hostElement$
          );
        } else if (invokeCtx.$event$ === ResourceEvent) {
          logWarn(
            'State mutation inside useResource$() is an antipattern. Use useTask$() instead',
            invokeCtx.$hostElement$
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

  has(target: TargetType, prop: string | symbol): boolean {
    if (prop === QOjectTargetSymbol) {
      return true;
    }
    const invokeCtx = tryGetInvokeContext();
    if (typeof prop === 'string' && invokeCtx) {
      const subscriber = invokeCtx.$subscriber$;
      if (subscriber) {
        const isA = isArray(target);
        this.$manager$.$addSub$(subscriber, isA ? undefined : prop);
      }
    }
    const hasOwnProperty = Object.prototype.hasOwnProperty;
    if (hasOwnProperty.call(target, prop)) {
      return true;
    }
    if (typeof prop === 'string' && hasOwnProperty.call(target, _IMMUTABLE_PREFIX + prop)) {
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
    if (isArray(target)) {
      return Reflect.ownKeys(target);
    }
    return Reflect.ownKeys(target).map((a) => {
      return typeof a === 'string' && a.startsWith(_IMMUTABLE_PREFIX)
        ? a.slice(_IMMUTABLE_PREFIX.length)
        : a;
    });
  }
  getOwnPropertyDescriptor(
    target: TargetType,
    prop: string | symbol
  ): PropertyDescriptor | undefined {
    const descriptor = Reflect.getOwnPropertyDescriptor(target, prop);

    if (isArray(target) || typeof prop === 'symbol') {
      return descriptor;
    }

    if (descriptor && !descriptor.configurable) {
      return descriptor;
    }

    return {
      enumerable: true,
      configurable: true,
    };
  }
}

const immutableValue = (value: any) => {
  return value === _IMMUTABLE || isSignal(value);
};

const wrap = <T>(value: T, containerState: ContainerState): T => {
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
      const proxy = containerState.$proxyMap$.get(nakedValue);
      return proxy ? proxy : getOrCreateProxy(nakedValue as any, containerState, QObjectRecursive);
    }
  }
  return value;
};
