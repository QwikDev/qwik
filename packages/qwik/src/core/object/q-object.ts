import { assertEqual, assertTrue } from '../assert/assert';
import {
  qError,
  QError_immutableProps,
  QError_onlyLiteralWrapped,
  QError_onlyObjectWrapped,
  QError_verifySerializable,
} from '../error/error';
import { isQrl } from '../import/qrl-class';
import { tryGetInvokeContext } from '../use/use-core';
import { isDocument, isElement, isNode } from '../util/element';
import { logWarn } from '../util/log';
import { qDev } from '../util/qdev';
import { tryGetContext } from '../props/props';
import { RenderEvent } from '../util/markers';
import { isArray, isFunction, isObject, isSerializableObject } from '../util/types';
import { isPromise } from '../util/promises';
import { canSerialize } from './serializers';
import type { ContainerState, LocalSubscriptionManager } from '../render/container';
import type { Subscriber } from '../use/use-watch';

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
  assertEqual(unwrapProxy(target), target, 'Unexpected proxy at this location', target);
  assertTrue(!containerState.$proxyMap$.has(target), 'Proxy was already created', target);

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
    const immutable = false && (this.$flags$ & QObjectImmutable) !== 0;
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
    if (canSerialize(unwrapped)) {
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
        if (isSerializableObject(unwrapped)) {
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
    return isConnected(sub.$el$);
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
