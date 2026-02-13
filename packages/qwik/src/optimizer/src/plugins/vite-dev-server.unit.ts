import { describe, expect, test } from 'vitest';
import { toDevServerHref } from './vite-dev-server';

describe('toDevServerHref', () => {
  test('normal CSS file with base /', () => {
    expect(toDevServerHref('/', '/src/styles.css')).toBe('/src/styles.css');
  });

  test('normal CSS file with custom base', () => {
    expect(toDevServerHref('/my-app/', '/src/styles.css')).toBe('/my-app/src/styles.css');
  });

  test('normal CSS file with HMR timestamp', () => {
    expect(toDevServerHref('/', '/src/styles.css?t=1234567890')).toBe(
      '/src/styles.css?t=1234567890'
    );
  });

  test('virtual CSS module with base /', () => {
    expect(toDevServerHref('/', 'virtual:my-plugin:foo.css')).toBe(
      '/@id/virtual:my-plugin:foo.css'
    );
  });

  test('virtual CSS module with custom base', () => {
    expect(toDevServerHref('/my-app/', 'virtual:my-plugin:foo.css')).toBe(
      '/my-app/@id/virtual:my-plugin:foo.css'
    );
  });

  test('virtual CSS module with \\0 prefix', () => {
    expect(toDevServerHref('/', '\0virtual:my-plugin:foo.css')).toBe(
      '/@id/virtual:my-plugin:foo.css'
    );
  });

  test('virtual CSS module with \\0 prefix and custom base', () => {
    expect(toDevServerHref('/my-app/', '\0virtual:my-plugin:foo.css')).toBe(
      '/my-app/@id/virtual:my-plugin:foo.css'
    );
  });

  test('virtual CSS module with path-like ID', () => {
    expect(toDevServerHref('/', 'virtual:my-plugin:/src/routes/index.tsx.css')).toBe(
      '/@id/virtual:my-plugin:/src/routes/index.tsx.css'
    );
  });
});
