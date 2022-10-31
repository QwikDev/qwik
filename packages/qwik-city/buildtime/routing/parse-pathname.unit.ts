import { test } from 'uvu';
import { equal } from 'uvu/assert';
import { parseRoutePathname } from './parse-pathname';

/**
 * Adopted from SvelteKit
 * https://github.com/sveltejs/kit/blob/master/LICENSE
 */

const tests = {
  '/': {
    pattern: /^\/$/,
    paramNames: [],
  },
  '/blog': {
    pattern: /^\/blog\/?$/,
    paramNames: [],
  },
  '/blog.json': {
    pattern: /^\/blog\.json$/,
    paramNames: [],
  },
  '/blog/[slug]': {
    pattern: /^\/blog\/([^/]+?)\/?$/,
    paramNames: ['slug'],
  },
  '/blog/[slug].json': {
    pattern: /^\/blog\/([^/]+?)\.json$/,
    paramNames: ['slug'],
  },
  '/[...rest]': {
    pattern: /^(?:\/(.*))?\/?$/,
    paramNames: ['rest'],
  },
  '/foo/[...rest]/bar': {
    pattern: /^\/foo(?:\/(.*))?\/bar\/?$/,
    paramNames: ['rest'],
  },
  '/base-pathname/': {
    pattern: /^\/base-pathname\/?$/,
    paramNames: [],
  },
};

for (const [key, expected] of Object.entries(tests)) {
  test(`parseRoutePathname: "${key}"`, () => {
    const actual = parseRoutePathname(key);
    equal(actual.pattern.toString(), expected.pattern.toString());
    equal(actual.paramNames, expected.paramNames);
  });
}

test.run();
