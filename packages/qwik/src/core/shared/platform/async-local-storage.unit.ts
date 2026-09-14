import { build } from 'esbuild';
import { AsyncLocalStorage } from 'node:async_hooks';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

test.each(['browser', 'edge-light', 'node'])('selects ALS for the %s bundle', async (runtime) => {
  const result = await build({
    stdin: {
      contents:
        "export { _getAsyncLocalStorage, getLocale, withLocale } from '@qwik.dev/core/internal';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: runtime === 'node' ? 'node' : 'browser',
    conditions: [runtime],
    external: ['node:async_hooks'],
    format: 'cjs',
    target: 'es2020',
    write: false,
    define: { __EXPERIMENTAL__: '{}', 'import.meta.hot': 'false', 'import.meta.env': '{}' },
  });
  const module = { exports: {} as typeof import('@qwik.dev/core/internal') };
  const require = vi.fn((id: string) => {
    expect(id).toBe('node:async_hooks');
    return { AsyncLocalStorage };
  });
  runInNewContext(result.outputFiles[0].text, { module, require, TextEncoder, TextDecoder, URL });

  const { _getAsyncLocalStorage, withLocale, getLocale } = module.exports;
  if (runtime === 'browser') {
    expect(_getAsyncLocalStorage()).toBeUndefined();
    expect(require).not.toHaveBeenCalled();
    return;
  }

  expect(_getAsyncLocalStorage()).toBe(AsyncLocalStorage);
  expect(require).toHaveBeenCalledOnce();
  await Promise.all(
    ['pl', 'en'].map((locale) =>
      withLocale(locale, async () => {
        await Promise.resolve();
        expect(getLocale()).toBe(locale);
      })
    )
  );
});

test('preserves concurrent locales without process.getBuiltinModule', async () => {
  vi.resetModules();
  vi.stubGlobal('process', { ...process, getBuiltinModule: undefined });
  const { getLocale, withLocale } = await import('../../use/use-locale');

  await Promise.all(
    ['pl', 'en'].map((locale) =>
      withLocale(locale, async () => {
        expect(getLocale()).toBe(locale);
        await Promise.resolve();
        expect(getLocale()).toBe(locale);
      })
    )
  );
  expect(getLocale('outside')).toBe('outside');
});
