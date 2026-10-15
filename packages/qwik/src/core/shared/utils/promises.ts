import { isDev, isServer } from '@qwik.dev/core/build';
import type { ValueOrPromise } from './types';

export const MAX_RETRY_ON_PROMISE_COUNT = 100;

export const isPromise = <T>(value: any): value is Promise<T> => {
  try {
    // not using "value instanceof Promise" to have zone.js support
    return !!value && typeof value == 'object' && typeof value.then === 'function';
  } catch {
    return false;
  }
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

export const promiseAll = <T extends readonly unknown[] | []>(
  promises: T
): ValueOrPromise<{ -readonly [P in keyof T]: Awaited<T[P]> }> => {
  const hasPromise = promises.some(isPromise);
  if (hasPromise) {
    return Promise.all(promises);
  }
  return promises as any;
};

/** @internal */
export const delay = (timeout: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
};

const checkError = (e: Error) => {
  try {
    if (isServer && e instanceof ReferenceError && e.message.includes('window')) {
      e.message = 'It seems like you forgot to add "if (isBrowser) {...}" here:' + e.message;
    }
  } catch {
    // ignore
  }
};
const justThrow = (e: any) => {
  throw e;
};

function throwRetryError(error: unknown): never {
  isDev && checkError(error as Error);
  throw error;
}

/**
 * Retries a function that throws a promise. If you pass `onError`, you're responsible for handling
 * errors.
 *
 * @internal
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

function acceptCancelledValue(value: unknown, callback?: (value: unknown) => void): void {
  try {
    callback?.(value);
  } catch {
    /* Cancelled work has no error recipient. */
  }
}

function observeCancelledValue(
  promise: Promise<unknown>,
  callback?: (value: unknown) => void
): void {
  if (callback === undefined) {
    promise.catch(() => {});
    return;
  }
  promise.then(
    (value) => acceptCancelledValue(value, callback),
    () => {}
  );
}

interface CancellationState {
  readonly isCancelled: boolean;
}

export function thenInLifetime<T, R>(
  lifetime: CancellationState | null,
  value: ValueOrPromise<T>,
  fulfilled: (value: Awaited<T>) => ValueOrPromise<R>,
  cancelledValue: unknown = undefined,
  rejected?: (error: unknown) => ValueOrPromise<R>,
  onCancelledValue?: (value: unknown) => void
): ValueOrPromise<R> {
  if (lifetime?.isCancelled) {
    if (isPromise(value)) {
      observeCancelledValue(value, onCancelledValue);
    } else {
      acceptCancelledValue(value, onCancelledValue);
    }
    return cancelledValue as R;
  }
  if (isPromise(value)) {
    return value.then(
      (value) => {
        if (lifetime?.isCancelled) {
          acceptCancelledValue(value, onCancelledValue);
          return cancelledValue as R;
        }
        return fulfilled(value as Awaited<T>);
      },
      (error) => {
        if (lifetime?.isCancelled) {
          return cancelledValue as R;
        }
        if (rejected !== undefined) {
          return rejected(error);
        }
        throw error;
      }
    );
  }
  const result = fulfilled(value as Awaited<T>);
  if (lifetime?.isCancelled) {
    if (isPromise(result)) {
      result.catch(() => {});
    }
    return cancelledValue as R;
  }
  return result;
}

export function retryAfterPromise<T>(
  lifetime: CancellationState | null,
  error: unknown,
  run: () => ValueOrPromise<T>,
  cancelledValue: unknown = undefined,
  remaining = MAX_RETRY_ON_PROMISE_COUNT
): ValueOrPromise<T> {
  if (!isPromise(error)) {
    return throwRetryError(error);
  }
  if (remaining === 0) {
    throw new Error('Exceeded max retry count in retryOnPromise');
  }
  return thenInLifetime(
    lifetime,
    error,
    () => retryInLifetime(lifetime, run, cancelledValue, remaining - 1),
    cancelledValue,
    (error) => retryAfterPromise(lifetime, error, run, cancelledValue, remaining - 1)
  );
}

export function retryInLifetime<T>(
  lifetime: CancellationState | null,
  run: () => ValueOrPromise<T>,
  cancelledValue: unknown = undefined,
  remaining = MAX_RETRY_ON_PROMISE_COUNT
): ValueOrPromise<T> {
  if (lifetime?.isCancelled) {
    return cancelledValue as T;
  }
  let result: ValueOrPromise<T>;
  try {
    result = run();
  } catch (error) {
    if (!isPromise(error)) {
      return throwRetryError(error);
    }
    if (lifetime?.isCancelled) {
      error.catch(() => {});
      return cancelledValue as T;
    }
    return retryAfterPromise(lifetime, error, run, cancelledValue, remaining);
  }
  if (lifetime?.isCancelled) {
    if (isPromise(result)) {
      result.catch(() => {});
    }
    return cancelledValue as T;
  }
  if (!isPromise(result)) {
    return result;
  }
  return thenInLifetime(
    lifetime,
    result,
    (value) => value as T,
    cancelledValue,
    (error) => retryAfterPromise(lifetime, error, run, cancelledValue, remaining)
  );
}
