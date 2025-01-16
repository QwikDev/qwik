import { QError, qError } from '../error/error';
import { isNode } from './element';
import { isPromise } from './promises';
import { isArray, isFunction, isObject, isSerializableObject } from './types';
import { canSerialize } from '../shared-serialization';
import { isSignal } from '../../signal/signal';
import { unwrapStore } from '../../signal/store';

/** @internal */
export const verifySerializable = <T>(value: T, preMessage?: string): T => {
  const seen = new Set();
  return _verifySerializable(value, seen, '_', preMessage);
};

const _verifySerializable = <T>(value: T, seen: Set<any>, ctx: string, preMessage?: string): T => {
  const unwrapped = unwrapStore(value);
  if (unwrapped == null) {
    return value;
  }
  if (shouldSerialize(unwrapped)) {
    if (seen.has(unwrapped)) {
      return value;
    }
    seen.add(unwrapped);
    if (isSignal(unwrapped)) {
      return value;
    }
    if (canSerialize(unwrapped)) {
      return value;
    }
    const typeObj = typeof unwrapped;
    switch (typeObj) {
      case 'object':
        if (isPromise(unwrapped)) {
          return value;
        }
        if (isNode(unwrapped)) {
          return value;
        }
        if (isArray(unwrapped)) {
          let expectIndex = 0;
          // Make sure the array has no holes
          unwrapped.forEach((v, i) => {
            if (i !== expectIndex) {
              throw qError(QError.verifySerializable, [unwrapped]);
            }
            _verifySerializable(v, seen, ctx + '[' + i + ']');
            expectIndex = i + 1;
          });
          return value;
        }
        if (isSerializableObject(unwrapped)) {
          for (const [key, item] of Object.entries(unwrapped)) {
            _verifySerializable(item, seen, ctx + '.' + key);
          }
          return value;
        }
        break;
      case 'boolean':
      case 'string':
      case 'number':
        return value;
    }
    let message = '';
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
      const fnName = (value as Function).name;
      message += ` because it's a function named "${fnName}". You might need to convert it to a QRL using $(fn):\n\nconst ${fnName} = $(${String(
        value
      )});\n\nPlease check out https://qwik.dev/docs/advanced/qrl/ for more information.`;
    }
    throw qError(QError.verifySerializable, [message]);
  }
  return value;
};
const noSerializeSet = /*#__PURE__*/ new WeakSet<object>();
const weakSerializeSet = /*#__PURE__*/ new WeakSet<object>();

export const shouldSerialize = (obj: unknown): boolean => {
  if (isObject(obj) || isFunction(obj)) {
    return !noSerializeSet.has(obj);
  }
  return true;
};

export const fastSkipSerialize = (obj: object): boolean => {
  return typeof obj === 'object' && obj && (NoSerializeSymbol in obj || noSerializeSet.has(obj));
};

export const fastWeakSerialize = (obj: object): boolean => {
  return weakSerializeSet.has(obj);
};

/**
 * Returned type of the `noSerialize()` function. It will be TYPE or undefined.
 *
 * @public
 * @see noSerialize
 */
export type NoSerialize<T> = (T & { __no_serialize__: true }) | undefined;

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
  if (input != null) {
    noSerializeSet.add(input);
  }
  return input as any;
};

/** @internal */
export const _weakSerialize = <T extends object>(input: T): Partial<T> => {
  weakSerializeSet.add(input);
  return input as any;
};

/**
 * If an object has this property, it will not be serialized
 *
 * @public
 */
export const NoSerializeSymbol = Symbol('noSerialize');
/**
 * If an object has this property as a function, it will be called with the object and should return
 * a serializable value.
 *
 * This can be used to clean up etc.
 *
 * @public
 */
export const SerializerSymbol = Symbol('serialize');
