import { expect, test } from 'vitest';
import { isStaticPath, matchesStaticPath } from './static-paths';

test('matches exact entries for GET only', () => {
  const paths = new Set(['/robots.txt', '/profile/']);
  expect(matchesStaticPath('GET', '/robots.txt', paths, [])).toBe(true);
  expect(matchesStaticPath('get', '/profile/', paths, [])).toBe(true);
  expect(matchesStaticPath('POST', '/robots.txt', paths, [])).toBe(false);
  expect(matchesStaticPath('GET', '/unknown/', paths, [])).toBe(false);
});

test('matches injected build and assets prefixes', () => {
  const prefixes = ['/base/q/build/', '/base/q/assets/'];
  expect(matchesStaticPath('GET', '/base/q/build/x.js', new Set<string>(), prefixes)).toBe(true);
  expect(matchesStaticPath('GET', '/base/q/assets/a.svg', new Set<string>(), prefixes)).toBe(true);
  expect(matchesStaticPath('GET', '/build/x.js', new Set<string>(), prefixes)).toBe(false);
});

test('falls back to default prefixes when placeholders are unreplaced', () => {
  // The source module still holds the placeholders, as in non-adapter builds.
  expect(isStaticPath('GET', new URL('https://qwik.dev/build/q.js'))).toBe(true);
  expect(isStaticPath('GET', new URL('https://qwik.dev/assets/a.svg'))).toBe(true);
  expect(isStaticPath('GET', new URL('https://qwik.dev/robots.txt'))).toBe(false);
});
