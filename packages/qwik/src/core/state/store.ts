import { assertEqual, assertNumber, assertTrue } from '../error/assert';
import { qError, QError_immutableProps } from '../error/error';
import { isQrl } from '../qrl/qrl-class';
import { tryGetInvokeContext } from '../use/use-core';
import { isNode } from '../util/element';
import { qDev } from '../util/qdev';
import { RenderEvent } from '../util/markers';
import { isArray, isObject, isSerializableObject } from '../util/types';
import type { ContainerState } from '../container/container';
import type { SubscriberEffect, SubscriberHost } from '../use/use-task';
import {
  LocalSubscriptionManager,
  shouldSerialize,
  Subscriptions,
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
import { logError } from '../util/log';

export type QObject<T extends {}> = T & { __brand__: 'QObject' };

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

/**
 * @internal
 */
export const _restProps = (props: Record<string, any>, omit: string[]) => {
  const rest: Record<string, any> = {};
  for (const key in props) {
    if (!omit.includes(key)) {
      rest[key] = props[key];
    }
  }
  return rest;
};

class ReadWriteProxyHandler implements ProxyHandler<TargetType> {
  constructor(
    private $containerState$: ContainerState,
    private $manager$: LocalSubscriptionManager
  ) {}

  get(target: TargetType, prop: string | symbol): any {
    if (typeof prop === 'symbol') {
      if (prop === QOjectTargetSymbol) return target;
      if (prop === QObjectManagerSymbol) return this.$manager$;
      return target[prop];
    }
    let subscriber: SubscriberHost | SubscriberEffect | undefined | null;
    const flags = target[QObjectFlagsSymbol] ?? 0;
    assertNumber(flags, 'flags must be an number');
    const invokeCtx = tryGetInvokeContext();
    const recursive = (flags & QObjectRecursive) !== 0;
    const immutable = (flags & QObjectImmutable) !== 0;
    let value = target[prop];
    if (invokeCtx) {
      subscriber = invokeCtx.$subscriber$;
    }
    if (immutable) {
      const hiddenSignal = target[_IMMUTABLE_PREFIX + prop];
      const immutableMeta = target[_IMMUTABLE]?.[prop];
      if (
        !(prop in target) ||
        !!hiddenSignal ||
        isSignal(immutableMeta) ||
        immutableMeta === _IMMUTABLE
      ) {
        subscriber = null;
      }
      if (hiddenSignal) {
        assertTrue(isSignal(hiddenSignal), '$$ prop must be a signal');
        value = hiddenSignal.value;
      }
    }
    if (subscriber) {
      const isA = isArray(target);
      this.$manager$.$addSub$([0, subscriber, isA ? undefined : prop]);
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
      verifySerializable(unwrappedNewValue);
      const invokeCtx = tryGetInvokeContext();
      if (invokeCtx && invokeCtx.$event$ === RenderEvent) {
        logError(
          'State mutation inside render function. Move mutation to useWatch(), useClientEffect() or useServerMount()',
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
    const hasOwnProperty = Object.prototype.hasOwnProperty;
    if (hasOwnProperty.call(target, property)) {
      return true;
    }
    if (typeof property === 'string' && hasOwnProperty.call(target, _IMMUTABLE_PREFIX + property)) {
      return true;
    }
    return false;
  }

  ownKeys(target: TargetType): ArrayLike<string | symbol> {
    const flags = target[QObjectFlagsSymbol] ?? 0;
    assertNumber(flags, 'flags must be an number');
    const immutable = (flags & QObjectImmutable) !== 0;
    if (!immutable) {
      let subscriber: SubscriberHost | SubscriberEffect | null | undefined = null;
      const invokeCtx = tryGetInvokeContext();
      if (invokeCtx) {
        subscriber = invokeCtx.$subscriber$;
      }
      if (subscriber) {
        this.$manager$.$addSub$([0, subscriber, undefined]);
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

  getOwnPropertyDescriptor(target: TargetType, prop: string) {
    if (isArray(target) || typeof prop === 'symbol') {
      return Object.getOwnPropertyDescriptor(target, prop);
    }
    return {
      enumerable: true,
      configurable: true,
    };
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
