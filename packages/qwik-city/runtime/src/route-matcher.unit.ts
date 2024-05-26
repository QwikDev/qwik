import { assert, describe, test } from 'vitest';
import { matchRoute } from './route-matcher';

describe('route-matcher', () => {
  test('should match /', () => {
    assert.deepEqual(matchRoute('/', '/'), {});
    assert.deepEqual(matchRoute('/', '/extra'), null, 'should not match extra');
  });

  test('should match /foo/', () => {
    assert.deepEqual(matchRoute('/foo', '/foo/'), {});
    assert.deepEqual(matchRoute('foo', '/foo/'), {});
    assert.deepEqual(matchRoute('/foo', '/foo/extra'), null, 'should not match extra');
  });

  test('should match /foo/ with trailing slash', () => {
    assert.deepEqual(matchRoute('/foo/', '/foo/'), {});
    assert.deepEqual(matchRoute('/foo/', '/foo'), {});
    assert.deepEqual(matchRoute('foo/', '/foo/'), {});
    assert.deepEqual(matchRoute('/foo/', '/foo/extra'), null, 'should not match extra');
  });

  test('should match /seg/[slug]/', () => {
    assert.deepEqual(matchRoute('/seg/[slug]', '/seg/extract-text/'), { slug: 'extract-text' });
    assert.deepEqual(
      matchRoute('/seg/[slug]', '/seg/[slug]/extra'),
      null,
      'should not match extra'
    );
  });

  test('should match /seg/[slug]/ with trailing slash', () => {
    assert.deepEqual(matchRoute('/seg/[slug]/', '/seg/extract-text/'), { slug: 'extract-text' });
    assert.deepEqual(
      matchRoute('/seg/[slug]/', '/seg/[slug]/extra'),
      null,
      'should not match extra'
    );
  });

  test('should match /seg/[slug]/[param]/', () => {
    assert.deepEqual(matchRoute('/seg/[slug]/[param]', '/seg/extract-text/param-text/'), {
      slug: 'extract-text',
      param: 'param-text',
    });
    assert.deepEqual(
      matchRoute('/seg/[slug]/[param]', '/seg/slug/param/extra'),
      null,
      'should not match extra'
    );
  });

  test('should match /seg/[slug]/[param]/ with trailing slash', () => {
    assert.deepEqual(matchRoute('/seg/[slug]/[param]/', '/seg/extract-text/param-text/'), {
      slug: 'extract-text',
      param: 'param-text',
    });
    assert.deepEqual(
      matchRoute('/seg/[slug]/[param]/', '/seg/slug/param/extra'),
      null,
      'should not match extra'
    );
  });

  test('should match /seg/[...rest]', () => {
    assert.deepEqual(matchRoute('/seg/[...rest]', '/seg/a/b/c'), { rest: 'a/b/c' });
  });

  test('should match /seg/[...rest]/a/b/c/d/e', () => {
    assert.deepEqual(matchRoute('/seg/[...rest]/a/b/c/d/e', '/seg/a/b/c/d/e'), {
      rest: '',
    });
  });

  test('should match /seg/[...rest] with trailing slash', () => {
    assert.deepEqual(matchRoute('/seg/[...rest]/', '/seg/a/b/c'), { rest: 'a/b/c' });
  });

  test('should match /stuff/[...param]', () => {
    assert.deepEqual(matchRoute('/stuff/[...param]', '/stuff/'), { param: '' }, '1');
    assert.deepEqual(matchRoute('/stuff/[...param]', '/stuff'), { param: '' }, '2');
  });

  test('should match /stuff/[...param] with trailing slash', () => {
    assert.deepEqual(matchRoute('/stuff/[...param]/', '/stuff/'), { param: '' }, '1');
    assert.deepEqual(matchRoute('/stuff/[...param]/', '/stuff'), { param: '' }, '2');
  });

  test('should match /seg/[paramA]/[...rest]', () => {
    assert.deepEqual(matchRoute('/seg/[paramA]/[...rest]', '/seg/a/b/c'), {
      paramA: 'a',
      rest: 'b/c',
    });
  });

  test('should match /seg/[paramA]/[...rest] with trailing slash', () => {
    assert.deepEqual(matchRoute('/seg/[paramA]/[...rest]/', '/seg/a/b/c'), {
      paramA: 'a',
      rest: 'b/c',
    });
  });

  test('regressions', () => {
    assert.deepEqual(matchRoute('qwikcity-test/api/data.json', '/qwikcity-test/blog/'), null);
    assert.deepEqual(matchRoute('/api/[org]/[user].json', '/api/builder.io/oss.json'), {
      org: 'builder.io',
      user: 'oss',
    });
    assert.deepEqual(matchRoute('/api/[org]/[user].json', '/api/builder.io/oss.json/'), {
      org: 'builder.io',
      user: 'oss',
    });
  });

  test('regressions matching missing segment', () => {
    assert.deepEqual(matchRoute('/[country]/[city]', '/other'), null, '00');
    assert.deepEqual(matchRoute('/[country]/[city]', '/other/'), null, '01');
  });

  test('/a/pre[infix]post', () => {
    assert.deepEqual(matchRoute('/a/pre[infix]post', '/a/preINpost'), {
      infix: 'IN',
    });
    assert.deepEqual(matchRoute('/a/pre[infix]post', '/a/prepost'), {
      infix: '',
    });
  });

  test('should match /a/pre[infix]post with trailing slash', () => {
    assert.deepEqual(matchRoute('/a/pre[infix]post/', '/a/preINpost'), {
      infix: 'IN',
    });
    assert.deepEqual(matchRoute('/a/pre[infix]post/', '/a/prepost'), {
      infix: '',
    });
  });

  test('/[...rest] ignore trailing slash', () => {
    assert.deepEqual(matchRoute('/[...rest]', '/a/b/c/'), {
      rest: 'a/b/c',
    });
    assert.deepEqual(matchRoute('/[...rest]/', '/a/b/c/'), {
      rest: 'a/b/c',
    });
  });
});

describe('routeMatcher/#2951', () => {
  test('/[...rest]', () => {
    assert.deepEqual(matchRoute('/[...rest]', '/'), { rest: '' });
  });

  test('/[...rest]/path', () => {
    assert.deepEqual(matchRoute('/[...rest]/path', '/path'), { rest: '' });
  });

  test('[...rest]/path', () => {
    assert.deepEqual(matchRoute('[...rest]/path', '/path'), { rest: '' });
  });

  test('/[...rest]/path', () => {
    assert.deepEqual(matchRoute('/[...rest]/path', '/a/b/c/path'), { rest: 'a/b/c' });
  });

  test('[...rest]/path', () => {
    assert.deepEqual(matchRoute('[...rest]/path', 'a/b/c/path'), { rest: 'a/b/c' });
  });

  test('/[...any]_suffix/path', () => {
    assert.deepEqual(matchRoute('/[...rest]_suffix/path', '/a/b/c_suffix/path'), { rest: 'a/b/c' });
  });

  test('/[...a]/[...b]/path', () => {
    assert.deepEqual(matchRoute('/[...a]/[...b]/path', '/a/b/c/path'), { a: 'a/b/c', b: '' });
  });
});

describe('routeMatcher/#5080', () => {
  test('/[...rest]/suffix', () => {
    assert.deepEqual(matchRoute('/[...rest]/', '/a/b/c/suffix/'), { rest: 'a/b/c/suffix' });
    assert.deepEqual(matchRoute('/[...rest]/suffix', '/a/b/c/suffix'), { rest: 'a/b/c' });
    assert.deepEqual(matchRoute('/[...rest]/suffix', '/a/b/c/suffix/'), { rest: 'a/b/c' });
  });
});

describe('routeMatcher/#5126', () => {
  test('/[...dynamicOne]/static-segment/[...dynamicTwo]/', () => {
    assert.deepEqual(
      matchRoute(
        '/[...dynamicOne]/static-segment/[...dynamicTwo]/',
        '/abc/xyz/static-segment/more-dynamic-123/'
      ),
      {
        dynamicOne: 'abc/xyz',
        dynamicTwo: 'more-dynamic-123',
      }
    );
  });
});
