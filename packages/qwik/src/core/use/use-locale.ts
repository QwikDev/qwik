import { getAsyncLocalStorage } from '@qwik.dev/core/async-local-storage';
import { isServer } from '@qwik.dev/core/build';
import type { AsyncLocalStorage } from 'node:async_hooks';
import { safeCall } from '../shared/utils/promises';
import { tryGetInvokeContext } from './use-core';
import { registerSingleton } from '../shared/singletons';

interface LocaleStore {
  locale: string | undefined;
  asyncStore: AsyncLocalStorage<string> | undefined;
}

const localeStore = registerSingleton<LocaleStore>('localeStore', () => ({
  locale: undefined,
  asyncStore: undefined,
}));

if (isServer) {
  const AsyncLocalStorage = getAsyncLocalStorage();
  if (AsyncLocalStorage) {
    if (!localeStore.asyncStore) {
      localeStore.asyncStore = new AsyncLocalStorage();
    }
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
  if (localeStore.asyncStore) {
    const locale = localeStore.asyncStore.getStore();
    if (locale) {
      return locale;
    }
  }

  if (localeStore.locale === undefined) {
    const ctx = tryGetInvokeContext();
    if (ctx && ctx.$locale$) {
      return ctx.$locale$;
    }
    if (defaultLocale !== undefined) {
      return defaultLocale;
    }
    throw new Error('Reading `locale` outside of context.');
  }
  return localeStore.locale;
}

/**
 * Override the `getLocale` with `lang` within the `fn` execution.
 *
 * `fn` may be async. The locale stays set until the returned promise settles, even when
 * AsyncLocalStorage is not available.
 *
 * @public
 */
export function withLocale<T>(locale: string, fn: () => T): T {
  if (localeStore.asyncStore) {
    return localeStore.asyncStore.run(locale, fn);
  }

  const previousLang = localeStore.locale;
  const restore = () => {
    localeStore.locale = previousLang;
  };
  localeStore.locale = locale;

  return safeCall(
    fn,
    (value) => {
      restore();
      return value;
    },
    (error) => {
      restore();
      throw error;
    }
  ) as T;
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
  if (localeStore.asyncStore) {
    localeStore.asyncStore.enterWith(locale);
    return;
  }
  localeStore.locale = locale;
}
