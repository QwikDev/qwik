import { test } from 'uvu';
import * as assert from 'uvu/assert';
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
  '/[...catchall]': {
    pattern: /^(?:\/(.*))?\/?$/,
    paramNames: ['catchall'],
  },
  '/foo/[...catchall]/bar': {
    pattern: /^\/foo(?:\/(.*))?\/bar\/?$/,
    paramNames: ['catchall'],
  },
};

for (const [key, expected] of Object.entries(tests)) {
  test(`parseRoutePathname: "${key}"`, () => {
    const actual = parseRoutePathname(key);

    assert.equal(actual.pattern.toString(), expected.pattern.toString());
    assert.equal(actual.paramNames, expected.paramNames);
  });
}

test.run();
