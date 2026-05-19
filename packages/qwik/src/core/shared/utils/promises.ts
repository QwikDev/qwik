import { isDev, isServer } from '@qwik.dev/core/build';
import type { ValueOrPromise } from './types';

export const MAX_RETRY_ON_PROMISE_COUNT = 100;

export const isPromise = <T>(value: any): value is Promise<T> => {
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

const checkError = (e: Error) => {
  if (isServer && e instanceof ReferenceError && e.message.includes('window')) {
    e.message = 'It seems like you forgot to add "if (isBrowser) {...}" here:' + e.message;
  }
};
const justThrow = (e: any) => {
  throw e;
};

/**
 * Retries a function that throws a promise. If you pass `onError`, you're responsible for handling
 * errors.
 */
export function retryOnPromise<T>(
  fn: () => ValueOrPromise<T>,
  onError: (e: any) => ValueOrPromise<T> = justThrow
): ValueOrPromise<T> {
  let ok = false;
  let result: ValueOrPromise<T> | Error;
  try {
    result = fn();
    ok = true;
  } catch (e) {
    result = e as Error;
  }

  if (!isPromise(result)) {
    // Synchronous function or error, no need to retry
    if (ok) {
      return result as T;
    }
    isDev && checkError(result as Error);
    return onError(result);
  }

  let retryCount: number = MAX_RETRY_ON_PROMISE_COUNT;
  const retry = async (p: Promise<void> | Error): Promise<T> => {
    while (isPromise<void>(p)) {
      try {
        await p;
        // We waited for the thrown promise, now try again
        return await fn();
      } catch (err) {
        if (isPromise<void>(err)) {
          if (!--retryCount) {
            p = new Error('Exceeded max retry count in retryOnPromise');
            break;
          } else {
            p = err;
          }
        } else {
          p = err as Error;
          break;
        }
      }
    }

    isDev && checkError(p as Error);
    return onError(p);
  };

  return ok ? result.catch(retry) : retry(result as Promise<void>);
}
