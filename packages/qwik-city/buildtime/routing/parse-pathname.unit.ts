import { test } from 'uvu';
import { equal } from 'uvu/assert';
import { parseRoutePathname } from './parse-pathname';

/**
 * Adopted from SvelteKit
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
    pattern: /^\/blog\.json$/,
    paramNames: [],
  },
  '/blog/[slug]': {
    basePathname: '/',
    pattern: /^\/blog\/([^/]+?)\/?$/,
    paramNames: ['slug'],
  },
  '/blog/[slug].json': {
    basePathname: '/',
    pattern: /^\/blog\/([^/]+?)\.json$/,
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
};

for (const [key, t] of Object.entries(tests)) {
  test(`parseRoutePathname: "${key}"`, () => {
    const actual = parseRoutePathname(t.basePathname, key);
    equal(actual.pattern.toString(), t.pattern.toString());
    equal(actual.paramNames, t.paramNames);
  });
}

test.run();
