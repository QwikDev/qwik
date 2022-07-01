import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { parsePathname } from './parse-route';

/**
 * Adopted from SvelteKit
 * https://github.com/sveltejs/kit/blob/master/LICENSE
 */

const tests = {
  '/': {
    pattern: /^\/$/,
    paramNames: [],
    paramTypes: [],
  },
  '/blog': {
    pattern: /^\/blog\/?$/,
    paramNames: [],
    paramTypes: [],
  },
  '/blog.json': {
    pattern: /^\/blog\.json$/,
    paramNames: [],
    paramTypes: [],
  },
  '/blog/[slug]': {
    pattern: /^\/blog\/([^/]+?)\/?$/,
    paramNames: ['slug'],
    paramTypes: [undefined],
  },
  '/blog/[slug].json': {
    pattern: /^\/blog\/([^/]+?)\.json$/,
    paramNames: ['slug'],
    paramTypes: [undefined],
  },
  '/[...catchall]': {
    pattern: /^(?:\/(.*))?\/?$/,
    paramNames: ['catchall'],
    paramTypes: [undefined],
  },
  '/foo/[...catchall]/bar': {
    pattern: /^\/foo(?:\/(.*))?\/bar\/?$/,
    paramNames: ['catchall'],
    paramTypes: [undefined],
  },
  '/matched/[id=uuid]': {
    pattern: /^\/matched\/([^/]+?)\/?$/,
    paramNames: ['id'],
    paramTypes: ['uuid'],
  },
};

for (const [key, expected] of Object.entries(tests)) {
  test(`parseRouteId: "${key}"`, () => {
    const actual = parsePathname(key);

    assert.equal(actual.pattern.toString(), expected.pattern.toString());
    assert.equal(actual.paramNames, expected.paramNames);
    assert.equal(actual.paramTypes, expected.paramTypes);
  });
}

test.run();
