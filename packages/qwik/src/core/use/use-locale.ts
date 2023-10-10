import { tryGetInvokeContext } from './use-core';

let _locale: string | undefined = undefined;

/**
 * Retrieve the current locale.
 *
 * If no current locale and there is no `defaultLocale` the function throws an error.
 *
 * @returns The locale.
 * @internal
 */
export function getLocale(defaultLocale?: string): string {
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
 * @internal
 */
export function withLocale<T>(locale: string, fn: () => T): T {
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
 * @param lang
 */
export function setLocale(locale: string): void {
  _locale = locale;
}
