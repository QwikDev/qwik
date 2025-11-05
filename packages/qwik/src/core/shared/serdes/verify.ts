import { QError, qError } from '../error/error';
import { isNode } from '../utils/element';
import { isPromise } from '../utils/promises';
import { isArray, isFunction, isObject, isSerializableObject } from '../utils/types';
import { canSerialize } from './index';
import { isSignal } from '../../reactive-primitives/utils';
import { unwrapStore } from '../../reactive-primitives/impl/store';
import { untrack } from '../../use/use-core';

/** @internal */
export const verifySerializable = <T>(value: T, preMessage?: string): T => {
  const seen = new WeakSet();
  return untrack(() => _verifySerializable(value, seen, '_', preMessage));
};

const _verifySerializable = <T>(
  value: T,
  seen: WeakSet<any>,
  ctx: string,
  preMessage?: string
): T => {
  const unwrapped = unwrapStore(value);
  if (unwrapped == null) {
    return value;
  }
  if (shouldSerialize(unwrapped)) {
    if (typeof unwrapped === 'object') {
      if (seen.has(unwrapped)) {
        return value;
      }
      seen.add(unwrapped);
    }
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
    (NoSerializeSymbol in obj || noSerializeSet.has(obj))
  );
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
