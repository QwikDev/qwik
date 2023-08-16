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

routeMatchSuite('should match /seg/[slug]/', () => {
  equal(matchRoute('/seg/[slug]', '/seg/extract-text/'), { slug: 'extract-text' });
  equal(matchRoute('/seg/[slug]', '/seg/[slug]/extra'), null, 'should not match extra');
});

routeMatchSuite('should match /seg/[slug]/[param]/', () => {
  equal(matchRoute('/seg/[slug]/[param]', '/seg/extract-text/param-text/'), {
    slug: 'extract-text',
    param: 'param-text',
  });
  equal(matchRoute('/seg/[slug]/[param]', '/seg/slug/param/extra'), null, 'should not match extra');
});

routeMatchSuite('should match /seg/[...rest]', () => {
  equal(matchRoute('/seg/[...rest]', '/seg/a/b/c'), { rest: 'a/b/c' });
});

routeMatchSuite('should match /stuff/[...param]', () => {
  equal(matchRoute('/stuff/[...param]', '/stuff/'), { param: '' }, '1');
  equal(matchRoute('/stuff/[...param]', '/stuff'), { param: '' }, '2');
});

routeMatchSuite('should match /seg/[paramA]/[...rest]', () => {
  equal(matchRoute('/seg/[paramA]/[...rest]', '/seg/a/b/c'), { paramA: 'a', rest: 'b/c' });
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

routeMatchSuite('/[...rest] ignore trailing slash', () => {
  equal(matchRoute('/[...rest]', '/a/b/c/'), {
    rest: 'a/b/c',
  });
});

routeMatchSuite.run();
