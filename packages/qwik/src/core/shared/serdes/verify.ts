import { QError, qError } from '../error/error';
import { isNode } from '../utils/element';
import { isPromise } from '../utils/promises';
import { isArray, isFunction, isObject, isSerializableObject } from '../utils/types';
import { isQrl } from '../qrl/qrl-utils';
import { Computed } from '../../vdomless/reactive/computed';
import { Signal } from '../../vdomless/reactive/signal';
import { isStore, StorePropSource } from '../../vdomless/reactive/store';

/** @internal */
export const verifySerializable = <T>(value: T, preMessage?: string): T => {
  const seen = new WeakSet();
  return _verifySerializable(value, seen, '_', preMessage) as T;
};

const _verifySerializable = <T>(
  value: T,
  seen: WeakSet<any>,
  ctx: string,
  preMessage?: string
): T => {
  if (value == null) {
    return value;
  }
  if (shouldSerialize(value)) {
    if (typeof value === 'object') {
      if (seen.has(value)) {
        return value;
      }
      seen.add(value);
    }
    if (isReactiveSource(value)) {
      return value;
    }
    if (isKnownSerializableValue(value)) {
      return value;
    }
    // Framework-internal branded values (e.g. route loaders/actions, validators)
    // are callables or objects that stamp __brand / __brand__ to opt out of the
    // serializer walking their internals. Honor that for both objects and
    // functions — loader/action refs are functions with __brand = 'server_loader'
    // / 'server_action' and should not be rejected as unserializable.
    if ((value as any).__brand || (value as any).__brand__) {
      return value;
    }
    const typeObj = typeof value;
    switch (typeObj) {
      case 'object':
        if (isPromise(value)) {
          return value;
        }
        if (isNode(value)) {
          return value;
        }
        if (isArray(value)) {
          let expectIndex = 0;
          // Make sure the array has no holes
          for (let i = 0; i < value.length; i++) {
            if (!(i in value)) {
              throw qError(QError.verifySerializable, [value]);
            }
            const v = value[i];
            if (i !== expectIndex) {
              throw qError(QError.verifySerializable, [value]);
            }
            _verifySerializable(v, seen, ctx + '[' + i + ']');
            expectIndex = i + 1;
          }
          return value;
        }
        if (isSerializableObject(value)) {
          for (const [key, item] of Object.entries(value)) {
            _verifySerializable(item, seen, ctx + '.' + key);
          }
          return value;
        }
        break;
    }
    let message: string;
    if (preMessage) {
      message = preMessage;
    } else {
      message = 'Value cannot be serialized';
    }
    if (ctx !== '_') {
      message += ` in ${ctx},`;
    }
    if (typeObj === 'object') {
      message += ` because it's an instance of "${value?.constructor.name}". You might need to use 'noSerialize()' or use an object literal instead. Check out https://qwik.dev/docs/advanced/dollar/`;
    } else if (typeObj === 'function') {
      const fnName = (value as unknown as Function).name;
      message += ` because it's a function named "${fnName}". You might need to convert it to a QRL using $(fn):\n\nconst ${fnName} = $(${String(
        value
      )});\n\nPlease check out https://qwik.dev/docs/advanced/qrl/ for more information.`;
    }
    throw qError(QError.verifySerializable, [message]);
  }
  return value;
};

const isReactiveSource = (value: unknown): boolean => {
  return (
    value instanceof Signal ||
    value instanceof Computed ||
    isStore(value) ||
    value instanceof StorePropSource
  );
};

const isKnownSerializableValue = (value: unknown): boolean => {
  if (value == null) {
    return true;
  }

  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean' || type === 'bigint') {
    return true;
  }
  if (type === 'function') {
    return isQrl(value);
  }
  if (!isObject(value)) {
    return false;
  }

  const hasTemporal = typeof Temporal !== 'undefined';
  return (
    isPromise(value) ||
    value instanceof Error ||
    value instanceof URL ||
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof URLSearchParams ||
    value instanceof FormData ||
    value instanceof Set ||
    value instanceof Map ||
    value instanceof Uint8Array ||
    (hasTemporal && value instanceof Temporal.Duration) ||
    (hasTemporal && value instanceof Temporal.Instant) ||
    (hasTemporal && value instanceof Temporal.PlainDate) ||
    (hasTemporal && value instanceof Temporal.PlainDateTime) ||
    (hasTemporal && value instanceof Temporal.PlainMonthDay) ||
    (hasTemporal && value instanceof Temporal.PlainTime) ||
    (hasTemporal && value instanceof Temporal.PlainYearMonth) ||
    (hasTemporal && value instanceof Temporal.ZonedDateTime)
  );
};

const noSerializeSet = /*#__PURE__*/ new WeakSet<object>();

const shouldSerialize = (obj: unknown): boolean => {
  if (isObject(obj) || isFunction(obj)) {
    return !noSerializeSet.has(obj) && !(NoSerializeSymbol in obj);
  }
  return true;
};

export const fastSkipSerialize = (obj: unknown): boolean => {
  return (
    !!obj &&
    (isObject(obj) || typeof obj === 'function') &&
    (noSerializeSet.has(obj) || NoSerializeSymbol in obj)
  );
};

/**
 * Returned type of the `noSerialize()` function. It will be TYPE or undefined.
 *
 * @public
 * @see noSerialize
 */
export type NoSerialize<T> = (T & { __no_serialize__?: true }) | undefined;

// <docs markdown="../../readme.md#noSerialize">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../../readme.md#noSerialize instead and run `pnpm docs.sync`)
/**
 * Marks a property on a store as non-serializable.
 *
 * At times it is necessary to store values on a store that are non-serializable. Normally this is a
 * runtime error as Store wants to eagerly report when a non-serializable property is assigned to
 * it.
 *
 * You can use `noSerialize()` to mark a value as non-serializable. The value is persisted in the
 * Store but does not survive serialization. The implication is that when your application is
 * resumed, the value of this object will be `undefined`. You will be responsible for recovering
 * from this.
 *
 * See: [noSerialize Tutorial](http://qwik.dev/tutorial/store/no-serialize)
 *
 * @public
 */
// </docs>
export const noSerialize = <T extends object | undefined>(input: T): NoSerialize<T> => {
  // only add supported values to the noSerializeSet, prevent console errors
  if ((isObject(input) && input !== null) || typeof input === 'function') {
    noSerializeSet.add(input);
  }
  return input as any;
};

/**
 * If an object has this property, it will not be serialized. Use this on prototypes to avoid having
 * to call `noSerialize()` on every object.
 *
 * @public
 */
export const NoSerializeSymbol = Symbol('noSerialize');
/**
 * If an object has this property as a function, it will be called with the object and should return
 * a serializable value.
 *
 * This can be used to clean up, integrate with other libraries, etc.
 *
 * The type your object should conform to is:
 *
 * ```ts
 * {
 *   [SerializerSymbol]: (this: YourType, toSerialize: YourType) => YourSerializableType;
 * }
 * ```
 *
 * @public
 */
export const SerializerSymbol = Symbol('serialize');
