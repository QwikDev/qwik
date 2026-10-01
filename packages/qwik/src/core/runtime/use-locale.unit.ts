import { afterEach, expect, test, vi } from 'vitest';

vi.mock('@qwik.dev/core/build', () => ({ isServer: true }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test('isolates concurrent locales without process.getBuiltinModule', async () => {
  vi.stubGlobal('process', { ...process, getBuiltinModule: undefined });
  const { getLocale, withLocale } = await import('./use-locale');

  const locales = ['pl', 'en'].map((locale) =>
    withLocale(locale, async () => {
      await Promise.resolve();
      expect(getLocale()).toBe(locale);
      return getLocale();
    })
  );

  await expect(Promise.all(locales)).resolves.toEqual(['pl', 'en']);
  expect(getLocale('fallback')).toBe('fallback');
});
