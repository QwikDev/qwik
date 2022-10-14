import { assertEqual, assertNumber, assertTrue } from '../assert/assert';
import { qError, QError_immutableProps, QError_verifySerializable } from '../error/error';
import { isQrl } from '../import/qrl-class';
import { tryGetInvokeContext } from '../use/use-core';
import { isDocument, isNode, isQwikElement } from '../util/element';
import { logWarn } from '../util/log';
import { qDev } from '../util/qdev';
import { tryGetContext } from '../props/props';
import { RenderEvent } from '../util/markers';
import { isArray, isFunction, isObject, isSerializableObject } from '../util/types';
import { isPromise } from '../util/promises';
import { canSerialize } from './serializers';
import type { ContainerState, LocalSubscriptionManager, Subscriptions } from '../render/container';
import type { SubscriberEffect, SubscriberHost } from '../use/use-watch';
import type { QwikElement } from '../render/dom/virtual-element';

export type QObject<T extends {}> = T & { __brand__: 'QObject' };

export const QObjectRecursive = 1 << 0;
export const QObjectImmutable = 1 << 1;

const QOjectTargetSymbol = Symbol('proxy target');
export const QObjectFlagsSymbol = Symbol('proxy flags');
export const QObjectManagerSymbol = Symbol('proxy manager');

/**
 * @alpha
 */
export interface Signal<T = any> {
  value: T;
}

/**
 * @alpha
 */
export type ValueOrSignal<T> = T | Signal<T>;

/**
 * @internal
 */
export const _IMMUTABLE = Symbol('IMMUTABLE');

export const _IMMUTABLE_PREFIX = '$$';
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
    (target as any)[QObjectFlagsSymbol] = flags;
  }
  return createProxy(target, containerState, undefined);
};

export const createSignal = <T>(
  value: T,
  containerState: ContainerState,
  subcriptions?: Subscriptions[]
): Signal<T> => {
  const manager = containerState.$subsManager$.$createManager$(subcriptions);
  const signal = new SignalImpl<T>(value, manager);
  return signal;
};

export class SignalImpl<T> implements Signal<T> {
  untrackedValue: T;
  [QObjectManagerSymbol]: LocalSubscriptionManager;

  constructor(v: T, manager: LocalSubscriptionManager) {
    this.untrackedValue = v;
    this[QObjectManagerSymbol] = manager;
  }

  get value() {
    const sub = tryGetInvokeContext()?.$subscriber$;
    if (sub) {
      this[QObjectManagerSymbol].$addSub$([0, sub, undefined]);
    }
    return this.untrackedValue;
  }
  set value(v: T) {
    if (qDev) {
      verifySerializable(v);
      const invokeCtx = tryGetInvokeContext();
      if (invokeCtx && invokeCtx.$event$ === RenderEvent) {
        logWarn(
          'State mutation inside render function. Move mutation to useWatch(), useClientEffect() or useServerMount()',
          invokeCtx.$hostElement$
        );
      }
    }
    const manager = this[QObjectManagerSymbol];
    const oldValue = this.untrackedValue;
    if (manager && oldValue !== v) {
      this.untrackedValue = v;
      manager.$notifySubs$();
    }
  }
}

export const isSignal = (obj: any): obj is Signal<any> => {
  return obj instanceof SignalImpl || obj instanceof SignalWrapper;
};

interface AddSignal {
  (type: 1, hostEl: QwikElement, signal: Signal, elm: QwikElement, property: string): void;
  (type: 2, hostEl: QwikElement, signal: Signal, elm: Node | string, property: string): void;
}
export const addSignalSub: AddSignal = (type, hostEl, signal, elm, property) => {
  const subscription =
    signal instanceof SignalWrapper
      ? [
          type,
          hostEl,
          getProxyTarget(signal.ref),
          elm as any,
          property,
          signal.prop === 'value' ? undefined : signal.prop,
        ]
      : [type, hostEl, signal, elm, property, undefined];
  getProxyManager(signal)!.$addSub$(subscription as any);
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

export type TargetType = Record<string | symbol, any>;

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
      if (!(prop in target) || !!hiddenSignal || !!target[_IMMUTABLE]?.[prop]) {
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
    let subscriber: SubscriberHost | SubscriberEffect | null | undefined = null;
    const invokeCtx = tryGetInvokeContext();
    if (invokeCtx) {
      subscriber = invokeCtx.$subscriber$;
    }
    if (subscriber) {
      this.$manager$.$addSub$([0, subscriber, undefined]);
    }
    return Reflect.ownKeys(target).map((a) => {
      return typeof a === 'string' && a.startsWith(_IMMUTABLE_PREFIX)
        ? a.slice(_IMMUTABLE_PREFIX.length)
        : a;
    });
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
    if (canSerialize(unwrapped)) {
      return value;
    }
    switch (typeof unwrapped) {
      case 'object':
        if (isPromise(unwrapped)) return value;
        if (isQwikElement(unwrapped)) return value;
        if (isDocument(unwrapped)) return value;
        if (isArray(unwrapped)) {
          for (const item of unwrapped) {
            _verifySerializable(item, seen);
          }
          return value;
        }
        if (isSerializableObject(unwrapped)) {
          for (const item of Object.values(unwrapped)) {
            _verifySerializable(item, seen);
          }
          return value;
        }
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

export const fastShouldSerialize = (obj: any): boolean => {
  return !noSerializeSet.has(obj);
};

/**
 * Returned type of the `noSerialize()` function. It will be TYPE or undefined.
 *
 * @see noSerialize
 * @public
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
 * @public
 */
// </docs>
export const noSerialize = <T extends object | undefined>(input: T): NoSerialize<T> => {
  if (input != null) {
    noSerializeSet.add(input);
  }
  return input as any;
};

/**
 * @alpha
 * @deprecated Remove it, not needed anymore
 */
export const mutable = <T>(v: T): T => {
  console.warn(
    'mutable() is deprecated, you can safely remove all usages of mutable() in your code'
  );
  return v;
};

/**
 * @internal
 * @deprecated Remove it, not needed anymore
 */
export const _useMutableProps = () => {};

export const isConnected = (sub: SubscriberEffect | SubscriberHost): boolean => {
  if (isQwikElement(sub)) {
    return !!tryGetContext(sub) || sub.isConnected;
  } else {
    return isConnected(sub.$el$);
  }
};

/**
 * @alpha
 */
export const unwrapProxy = <T>(proxy: T): T => {
  return isObject(proxy) ? getProxyTarget<any>(proxy) ?? proxy : proxy;
};

export const getProxyTarget = <T extends Record<string, any>>(obj: T): T | undefined => {
  return (obj as any)[QOjectTargetSymbol];
};

export const getProxyManager = (obj: Record<string, any>): LocalSubscriptionManager | undefined => {
  return (obj as any)[QObjectManagerSymbol];
};

export const getProxyFlags = <T = Record<string, any>>(obj: T): number | undefined => {
  return (obj as any)[QObjectFlagsSymbol];
};

export class SignalWrapper<T extends Record<string, any>, P extends keyof T> {
  constructor(public ref: T, public prop: P) {}

  get [QObjectManagerSymbol]() {
    return getProxyManager(this.ref);
  }

  get value(): T[P] {
    return this.ref[this.prop];
  }

  set value(value: T[P]) {
    this.ref[this.prop] = value;
  }
}

/**
 * @internal
 */
export const _wrapSignal = <T extends Record<any, any>, P extends keyof T>(
  obj: T,
  prop: P
): any => {
  if (!isObject(obj)) {
    return undefined;
  }
  if (obj instanceof SignalImpl) {
    assertEqual(prop, 'value', 'Left side is a signal, prop must be value');
    return obj;
  }
  if (obj instanceof SignalWrapper) {
    assertEqual(prop, 'value', 'Left side is a signal, prop must be value');
    return obj;
  }
  const target = getProxyTarget(obj);
  if (target) {
    const signal = target[_IMMUTABLE_PREFIX + (prop as any)];
    if (signal) {
      assertTrue(isSignal(signal), `${_IMMUTABLE_PREFIX} has to be a signal kind`);
      return signal;
    }
    return new SignalWrapper(obj, prop);
  }
  const immutable = (obj as any)[_IMMUTABLE]?.[prop];
  if (isSignal(immutable)) {
    return immutable;
  }
  return obj[prop];
};
