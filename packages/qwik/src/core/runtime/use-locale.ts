import { getAsyncLocalStorage } from '../shared/platform/async-local-storage';
import { isServer } from '@qwik.dev/core/build';
import type { AsyncLocalStorage } from 'node:async_hooks';
import { getActiveInvokeContextOrNull } from './invoke-context';

let _locale: string | undefined = undefined;

let localAsyncStore: AsyncLocalStorage<string> | undefined;

if (isServer) {
  const AsyncLocalStorage = getAsyncLocalStorage();
  if (AsyncLocalStorage) {
    localAsyncStore = new AsyncLocalStorage();
  }
}

/**
 * Retrieve the current locale.
 *
 * If no current locale and there is no `defaultLocale` the function throws an error.
 *
 * @returns The locale.
 * @public
 */
export function getLocale(defaultLocale?: string): string {
  // Prefer per-request locale from local AsyncLocalStorage if available (server-side)
  if (localAsyncStore) {
    const locale = localAsyncStore.getStore();
    if (locale) {
      return locale;
    }
  }

  if (_locale) {
    return _locale;
  }

  const locale = getActiveInvokeContextOrNull()?.container?.locale;
  if (locale) {
    return locale;
  }

  if (defaultLocale !== undefined) {
    return defaultLocale;
  }
  throw new Error('Reading `locale` outside of context.');
}

/**
 * Override the `getLocale` with `lang` within the `fn` execution.
 *
 * @public
 */
export function withLocale<T>(locale: string, fn: () => T): T {
  if (localAsyncStore) {
    return localAsyncStore.run(locale, fn);
  }

  const previousLang = _locale;
  try {
    _locale = locale;
    const result = fn();
    const promise = result as unknown as Promise<T>;
    if (result && typeof promise.finally === 'function') {
      return promise.finally(() => {
        _locale = previousLang;
      }) as T;
    }
    _locale = previousLang;
    return result;
  } catch (err) {
    _locale = previousLang;
    throw err;
  }
}

/**
 * Globally set a lang.
 *
 * This can be used only in browser. Server execution requires that each request could potentially
 * be a different lang, therefore setting a global lang would produce incorrect responses.
 *
 * @public
 */
export function setLocale(locale: string): void {
  if (localAsyncStore) {
    localAsyncStore.enterWith(locale);
    return;
  }
  _locale = locale;
}
