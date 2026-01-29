import { assert, test } from 'vitest';
import { parseRoutePathname } from './parse-pathname';

/**
 * Adopted from SvelteKit
 *
 * https://github.com/sveltejs/kit/blob/master/LICENSE
 */

const tests = {
  '/': {
    basePathname: '/',
    pattern: /^\/$/,
    paramNames: [],
  },
  '/base.pathname/': {
    basePathname: '/base.pathname/',
    pattern: /^\/base\.pathname\/$/,
    paramNames: [],
  },
  '/base/pathname/': {
    basePathname: '/base/pathname/',
    pattern: /^\/base\/pathname\/$/,
    paramNames: [],
  },
  '/blog': {
    basePathname: '/',
    pattern: /^\/blog\/?$/,
    paramNames: [],
  },
  '/base/pathname/blog': {
    basePathname: '/base/pathname/',
    pattern: /^\/base\/pathname\/blog\/?$/,
    paramNames: [],
  },
  '/blog.json': {
    basePathname: '/',
    pattern: /^\/blog\.json\/?$/,
    paramNames: [],
  },
  '/blog/[slug]': {
    basePathname: '/',
    pattern: /^\/blog\/([^/]+?)\/?$/,
    paramNames: ['slug'],
  },
  '/blog/[slug].json': {
    basePathname: '/',
    pattern: /^\/blog\/([^/]+?)\.json\/?$/,
    paramNames: ['slug'],
  },
  '/[...rest]': {
    basePathname: '/',
    pattern: /^(?:\/(.*))?\/?$/,
    paramNames: ['rest'],
  },
  '/foo/[...rest]/bar': {
    basePathname: '/',
    pattern: /^\/foo(?:\/(.*))?\/bar\/?$/,
    paramNames: ['rest'],
  },
  '/xyz/abc.dot/': {
    basePathname: '/',
    pattern: /^\/xyz\/abc\.dot\/?$/,
    paramNames: [],
  },
  '/xyz/%D8%B9%D8%B1%D8%A8%D9%8A/': {
    basePathname: '/',
    pattern: /^\/xyz\/%D8%B9%D8%B1%D8%A8%D9%8A\/?$/,
    paramNames: [],
  },
  '/xyz/server$/': {
    basePathname: '/',
    pattern: /^\/xyz\/server\$\/?$/,
    paramNames: [],
  },
};

for (const [key, t] of Object.entries(tests)) {
  test(`parseRoutePathname: "${key}"`, () => {
    const actual = parseRoutePathname(t.basePathname, key);
    assert.equal(actual.pattern.toString(), t.pattern.toString());
    assert.deepEqual(actual.paramNames, t.paramNames);
  });
}
