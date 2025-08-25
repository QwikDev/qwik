import { tryGetInvokeContext } from './use-core';
import { isServer } from '@qwik.dev/core/build';
import type { AsyncLocalStorage } from 'node:async_hooks';

let _locale: string | undefined = undefined;

let localAsyncStore: AsyncLocalStorage<{ locale?: string }> | undefined;

if (isServer) {
  import('node:async_hooks')
    .then((module) => {
      const AsyncLocalStorage = module.AsyncLocalStorage as unknown as new () => AsyncLocalStorage<{
        locale?: string;
      }>;
      localAsyncStore = new AsyncLocalStorage();
    })
    .catch(() => {
      // ignore if AsyncLocalStorage is not available
    });
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
    const locale = localAsyncStore.getStore()?.locale;
    if (locale) {
      return locale;
    }
  }

  if (_locale === undefined) {
    const ctx = tryGetInvokeContext();
    if (ctx && ctx.$locale$) {
      return ctx.$locale$;
    }
    if (defaultLocale !== undefined) {
      return defaultLocale;
    }
    throw new Error('Reading `locale` outside of context.');
  }
  return _locale;
}

/**
 * Override the `getLocale` with `lang` within the `fn` execution.
 *
 * @public
 */
export function withLocale<T>(locale: string, fn: () => T): T {
  // If running on the server with AsyncLocalStorage, set locale for this async context
  try {
    if (localAsyncStore) {
      return localAsyncStore.run({ locale }, fn);
    }
  } catch {
    // ignore and fallback
  }

  const previousLang = _locale;
  try {
    _locale = locale;
    return fn();
  } finally {
    _locale = previousLang;
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
  // On the server, prefer setting the locale on the local per-request store
  try {
    if (localAsyncStore && localAsyncStore.getStore) {
      const store = localAsyncStore.getStore();
      store!.locale = locale;
      return;
    }
  } catch {
    // ignore and fallback
  }
  _locale = locale;
}
