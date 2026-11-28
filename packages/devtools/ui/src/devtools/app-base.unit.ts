import { describe, expect, test } from 'vitest';
import { parseAppBase } from './app-base';

describe('iframe application base', () => {
  test('accepts same-origin absolute paths and normalizes a trailing slash', () => {
    expect(parseAppBase('/docs', 'http://localhost:5173')).toBe('/docs/');
    expect(parseAppBase('/', 'http://localhost:5173')).toBe('/');
  });

  test.each([
    '',
    'https://other.example/',
    '//other.example/',
    '/docs?token=abc',
    '/a/../b',
    '/a\\b',
  ])('rejects unsafe or invalid base %s', (base) => {
    expect(() => parseAppBase(base, 'http://localhost:5173')).toThrow();
  });
});
