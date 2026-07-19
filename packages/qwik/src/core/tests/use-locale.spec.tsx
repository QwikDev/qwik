import { component$ } from '@qwik.dev/core';
import { getLocale, setLocale, withLocale } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { ssrRender, testRenderer } from '../test-utils';

const debug = false;

const { name, render } = testRenderer;

describe(`${name}: useLocale`, () => {
  it('should return the default locale', async () => {
    const App = () => {
      const locale = getLocale('en');
      return <span data-locale={locale} />;
    };

    const { container, cleanup } = await render(App, { debug });

    expect(container.querySelector('span')!.getAttribute('data-locale')).toBe('en');

    cleanup();
  });

  it('should read locale set before render', async () => {
    const App = () => {
      const locale = getLocale('en');
      return <span data-locale={locale} />;
    };

    setLocale('pl');
    try {
      const { container, cleanup } = await render(App, { debug });

      expect(container.querySelector('span')!.getAttribute('data-locale')).toBe('pl');

      cleanup();
    } finally {
      setLocale(undefined as any);
    }
  });
});

describe('useLocale', () => {
  it('restores nested synchronous locale scopes', () => {
    const values = withLocale('en', () => [
      getLocale(),
      withLocale('pl', () => getLocale()),
      getLocale(),
    ]);

    expect(values).toEqual(['en', 'pl', 'en']);
    expect(getLocale('fallback')).toBe('fallback');
  });

  it('keeps an asynchronous locale scope until settlement', async () => {
    const locale = await withLocale('pl', async () => {
      await Promise.resolve();
      return getLocale();
    });

    expect(locale).toBe('pl');
    expect(getLocale('fallback')).toBe('fallback');
  });

  it.runIf(testRenderer.render === ssrRender)('should read ssr locale', async () => {
    const App = () => {
      const locale = getLocale('en');
      return <span data-locale={locale} />;
    };

    const { container, document, cleanup } = await ssrRender(App, {
      debug,
      locale: 'pl',
    });

    expect(container.querySelector('span')!.getAttribute('data-locale')).toBe('pl');
    expect(document.documentElement.getAttribute('q:locale')).toBe('pl');

    cleanup();
  });

  it.runIf(testRenderer.render === ssrRender)('should read resumed event locale', async () => {
    const readLocale = getLocale;
    const App = component$(() => {
      return (
        <button
          onClick$={() => {
            (globalThis as any).__qwikClickLocale = readLocale();
          }}
        >
          Locale
        </button>
      );
    });
    const { container, cleanup, qwikLoader } = await ssrRender(App, {
      debug,
      locale: 'pl',
    });
    const button = container.querySelector('button')!;
    const qwikContainer = button.closest('[q\\:container]') as HTMLElement;

    expect(qwikContainer.getAttribute('q:locale')).toBe('pl');

    try {
      await qwikLoader!.dispatch(button, 'click');
      expect((globalThis as any).__qwikClickLocale).toBe('pl');
    } finally {
      cleanup();
      delete (globalThis as any).__qwikClickLocale;
    }
  });
});
