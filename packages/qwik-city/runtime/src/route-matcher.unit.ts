import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { matchRoute } from './route-matcher';

const routeMatchSuite = suite('routeMatcher');

routeMatchSuite('should match /', () => {
  equal(matchRoute('/', '/'), {});
  equal(matchRoute('/', '/extra'), null, 'should not match extra');
});

routeMatchSuite('should match /foo/', () => {
  equal(matchRoute('/foo', '/foo/'), {});
  equal(matchRoute('foo', '/foo/'), {});
  equal(matchRoute('/foo', '/foo/extra'), null, 'should not match extra');
});

routeMatchSuite('should match /foo/ with trailing slash', () => {
  equal(matchRoute('/foo/', '/foo/'), {});
  equal(matchRoute('/foo/', '/foo'), {});
  equal(matchRoute('foo/', '/foo/'), {});
  equal(matchRoute('/foo/', '/foo/extra'), null, 'should not match extra');
});

routeMatchSuite('should match /seg/[slug]/', () => {
  equal(matchRoute('/seg/[slug]', '/seg/extract-text/'), { slug: 'extract-text' });
  equal(matchRoute('/seg/[slug]', '/seg/[slug]/extra'), null, 'should not match extra');
});

routeMatchSuite('should match /seg/[slug]/ with trailing slash', () => {
  equal(matchRoute('/seg/[slug]/', '/seg/extract-text/'), { slug: 'extract-text' });
  equal(matchRoute('/seg/[slug]/', '/seg/[slug]/extra'), null, 'should not match extra');
});

routeMatchSuite('should match /seg/[slug]/[param]/', () => {
  equal(matchRoute('/seg/[slug]/[param]', '/seg/extract-text/param-text/'), {
    slug: 'extract-text',
    param: 'param-text',
  });
  equal(matchRoute('/seg/[slug]/[param]', '/seg/slug/param/extra'), null, 'should not match extra');
});

routeMatchSuite('should match /seg/[slug]/[param]/ with trailing slash', () => {
  equal(matchRoute('/seg/[slug]/[param]/', '/seg/extract-text/param-text/'), {
    slug: 'extract-text',
    param: 'param-text',
  });
  equal(
    matchRoute('/seg/[slug]/[param]/', '/seg/slug/param/extra'),
    null,
    'should not match extra'
  );
});

routeMatchSuite('should match /seg/[...rest]', () => {
  equal(matchRoute('/seg/[...rest]', '/seg/a/b/c'), { rest: 'a/b/c' });
});

routeMatchSuite('should match /seg/[...rest] with trailing slash', () => {
  equal(matchRoute('/seg/[...rest]/', '/seg/a/b/c'), { rest: 'a/b/c' });
});

routeMatchSuite('should match /stuff/[...param]', () => {
  equal(matchRoute('/stuff/[...param]', '/stuff/'), { param: '' }, '1');
  equal(matchRoute('/stuff/[...param]', '/stuff'), { param: '' }, '2');
});

routeMatchSuite('should match /stuff/[...param] with trailing slash', () => {
  equal(matchRoute('/stuff/[...param]/', '/stuff/'), { param: '' }, '1');
  equal(matchRoute('/stuff/[...param]/', '/stuff'), { param: '' }, '2');
});

routeMatchSuite('should match /seg/[paramA]/[...rest]', () => {
  equal(matchRoute('/seg/[paramA]/[...rest]', '/seg/a/b/c'), { paramA: 'a', rest: 'b/c' });
});

routeMatchSuite('should match /seg/[paramA]/[...rest] with trailing slash', () => {
  equal(matchRoute('/seg/[paramA]/[...rest]/', '/seg/a/b/c'), { paramA: 'a', rest: 'b/c' });
});

routeMatchSuite('regressions', () => {
  equal(matchRoute('qwikcity-test/api/data.json', '/qwikcity-test/blog/'), null);
  equal(matchRoute('/api/[org]/[user].json', '/api/builder.io/oss.json'), {
    org: 'builder.io',
    user: 'oss',
  });
  equal(matchRoute('/api/[org]/[user].json', '/api/builder.io/oss.json/'), {
    org: 'builder.io',
    user: 'oss',
  });
});

routeMatchSuite('regressions matching missing segment', () => {
  equal(matchRoute('/[country]/[city]', '/other'), null, '00');
  equal(matchRoute('/[country]/[city]', '/other/'), null, '01');
});

routeMatchSuite('/a/pre[infix]post', () => {
  equal(matchRoute('/a/pre[infix]post', '/a/preINpost'), {
    infix: 'IN',
  });
  equal(matchRoute('/a/pre[infix]post', '/a/prepost'), {
    infix: '',
  });
});

routeMatchSuite('should match /a/pre[infix]post with trailing slash', () => {
  equal(matchRoute('/a/pre[infix]post/', '/a/preINpost'), {
    infix: 'IN',
  });
  equal(matchRoute('/a/pre[infix]post/', '/a/prepost'), {
    infix: '',
  });
});

routeMatchSuite('/[...rest] ignore trailing slash', () => {
  equal(matchRoute('/[...rest]', '/a/b/c/'), {
    rest: 'a/b/c',
  });
  equal(matchRoute('/[...rest]/', '/a/b/c/'), {
    rest: 'a/b/c',
  });
});

routeMatchSuite.run();

const regression2951 = suite('routeMatcher/#2951');

regression2951('/[...rest]', () => {
  equal(matchRoute('/[...rest]', '/'), { rest: '' });
});

regression2951('/[...rest]/path', () => {
  equal(matchRoute('/[...rest]/path', '/path'), { rest: '' });
});

regression2951('[...rest]/path', () => {
  equal(matchRoute('[...rest]/path', '/path'), { rest: '' });
});

regression2951('/[...rest]/path', () => {
  equal(matchRoute('/[...rest]/path', '/a/b/c/path'), { rest: 'a/b/c' });
});

regression2951('[...rest]/path', () => {
  equal(matchRoute('[...rest]/path', 'a/b/c/path'), { rest: 'a/b/c' });
});

regression2951('/[...any]_suffix/path', () => {
  equal(matchRoute('/[...rest]_suffix/path', '/a/b/c_suffix/path'), { rest: 'a/b/c' });
});

regression2951('/[...a]/[...b]/path', () => {
  equal(matchRoute('/[...a]/[...b]/path', '/a/b/c/path'), { a: 'a/b/c', b: '' });
});

regression2951.run();

const regression5080 = suite('routeMatcher/#5080');
regression5080('/[...rest]/suffix', () => {
  equal(matchRoute('/[...rest]/', '/a/b/c/suffix/'), { rest: 'a/b/c/suffix' });
  equal(matchRoute('/[...rest]/suffix', '/a/b/c/suffix'), { rest: 'a/b/c' });
  equal(matchRoute('/[...rest]/suffix', '/a/b/c/suffix/'), { rest: 'a/b/c' });
});
regression5080.run();

const regression5126 = suite('routeMatcher/#5126');
regression5126('/[...dynamicOne]/static-segment/[...dynamicTwo]/', () => {
  equal(
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
regression5126.run();
