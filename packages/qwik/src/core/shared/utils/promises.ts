import { isDev, isServer } from '@qwik.dev/core/build';
import type { ValueOrPromise } from './types';

export const MAX_RETRY_ON_PROMISE_COUNT = 100;

export const isPromise = (value: any): value is Promise<any> => {
  // not using "value instanceof Promise" to have zone.js support
  return !!value && typeof value == 'object' && typeof value.then === 'function';
};

export const safeCall = <T, B, C>(
  call: () => ValueOrPromise<T>,
  thenFn: { f(arg: Awaited<T>): ValueOrPromise<B> }['f'],
  rejectFn: { f(reason: any): ValueOrPromise<C> }['f']
): ValueOrPromise<B | C> => {
  try {
    const result = call();
    if (isPromise(result)) {
      return result.then(thenFn as any, rejectFn);
    } else {
      return thenFn(result as any);
    }
  } catch (e) {
    return rejectFn(e);
  }
};

export const maybeThen = <T, B>(
  valueOrPromise: ValueOrPromise<T>,
  thenFn: (arg: Awaited<T>) => ValueOrPromise<B>
): ValueOrPromise<B> => {
  return isPromise(valueOrPromise)
    ? valueOrPromise.then(thenFn as any)
    : thenFn(valueOrPromise as any);
};

export const maybeThenMap = <T, MAP_RET, RET>(
  array: ValueOrPromise<T>[],
  thenMapFn: (item: T) => ValueOrPromise<MAP_RET>,
  thenFn: (items: MAP_RET[]) => ValueOrPromise<RET>
): ValueOrPromise<RET> => {
  const length = array.length;
  const mappedArray: MAP_RET[] = [];
  let idx = 0;
  const drain = (): ValueOrPromise<MAP_RET[]> => {
    let result: ValueOrPromise<MAP_RET>;
    do {
      const item = array[idx];
      result = isPromise(item) ? item.then(thenMapFn) : thenMapFn(item);
      if (isPromise(result)) {
        return result.then((value) => {
          mappedArray[idx] = value;
          return drain();
        });
      } else {
        mappedArray[idx] = result;
        idx++;
      }
    } while (idx < length);
    return mappedArray;
  };
  return maybeThen(drain(), thenFn);
};

export const promiseAll = <T extends readonly unknown[] | []>(
  promises: T
): ValueOrPromise<{ -readonly [P in keyof T]: Awaited<T[P]> }> => {
  const hasPromise = promises.some(isPromise);
  if (hasPromise) {
    return Promise.all(promises);
  }
  return promises as any;
};

export const promiseAllLazy = <T extends readonly unknown[] | []>(
  promises: T
): ValueOrPromise<void> => {
  if (promises.length > 0) {
    return Promise.all(promises) as any;
  }
  return promises as any;
};

export const isNotNullable = <T>(v: T): v is NonNullable<T> => {
  return v != null;
};

export const delay = (timeout: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
};

/** Retries a function that throws a promise. */
export function retryOnPromise<T>(
  fn: () => ValueOrPromise<T>,
  retryCount: number = 0
): ValueOrPromise<T> {
  const retryOrThrow = (e: any): ValueOrPromise<T> => {
    if (isPromise(e) && retryCount < MAX_RETRY_ON_PROMISE_COUNT) {
      return e.then(retryOnPromise.bind(null, fn, retryCount++)) as ValueOrPromise<T>;
    }
    if (isDev && isServer && e instanceof ReferenceError && e.message.includes('window')) {
      e.message = 'It seems like you forgot to add "if (isBrowser) {...}" here:' + e.message;
    }
    throw e;
  };

  try {
    const result = fn();
    if (isPromise(result)) {
      // not awaited promise is not caught by try/catch block
      return result.catch((e) => retryOrThrow(e));
    }
    return result;
  } catch (e) {
    return retryOrThrow(e);
  }
}
