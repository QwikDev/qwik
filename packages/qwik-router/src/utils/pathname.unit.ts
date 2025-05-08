import type { PathParams } from '../runtime/src/types';
import { getPathnameForDynamicRoute, isSameOriginUrl, normalizePathname } from './pathname';
import { parseRoutePathname } from '../buildtime/routing/parse-pathname';
import { assert, test } from 'vitest';

test('isSameOriginUrl', () => {
  const t = [
    { url: '#hash', expect: false },
    { url: '   #hash', expect: false },
    { url: '', expect: false },
    { url: '    ', expect: false },
    { url: 'javascript://nice', expect: false },
    { url: 'file://local', expect: false },
    { url: 'about://blank', expect: false },
    { url: 'HTTPS://qwik.dev', expect: false },
    { url: 'http://qwik.dev', expect: false },
    { url: 'relative:whatever', expect: true },
    { url: 'relative', expect: true },
    { url: './relative', expect: true },
    { url: '/absolute', expect: true },
    { url: undefined, expect: false },
    { url: null, expect: false },
  ];
  t.forEach((c) => {
    assert.equal(isSameOriginUrl(c.url!), c.expect, c.url!);
  });
});

test('normalizePathname', () => {
  const tests = [
    {
      pathname: '/name/',
      basePathname: '/',
      trailingSlash: true,
      expect: '/name/',
    },
    {
      pathname: '/name',
      basePathname: '/',
      trailingSlash: true,
      expect: '/name/',
    },
    {
      pathname: '/name/',
      basePathname: '/',
      trailingSlash: false,
      expect: '/name',
    },
    {
      pathname: '/name',
      basePathname: '/',
      trailingSlash: false,
      expect: '/name',
    },
    {
      pathname: 'plz no spaces',
      basePathname: '/',
      trailingSlash: false,
      expect: '/plz%20no%20spaces',
    },
    {
      pathname: './about',
      basePathname: '/',
      trailingSlash: false,
      expect: '/about',
    },
    {
      pathname: '/about.html',
      basePathname: '/site/',
      trailingSlash: true,
      expect: '/site/about.html',
    },
    {
      pathname: '/about.html',
      basePathname: '/site/',
      trailingSlash: false,
      expect: '/site/about.html',
    },
    {
      pathname: '/about',
      basePathname: '/site/',
      trailingSlash: true,
      expect: '/site/about/',
    },
    {
      pathname: '/about/',
      basePathname: '/site/',
      trailingSlash: false,
      expect: '/site/about',
    },
    {
      pathname: '/',
      basePathname: '/site/',
      trailingSlash: true,
      expect: '/site/',
    },
    {
      pathname: '/',
      basePathname: '/site/',
      trailingSlash: false,
      expect: '/site/',
    },
    {
      pathname: '/',
      basePathname: '/',
      trailingSlash: true,
      expect: '/',
    },
    {
      pathname: '/',
      basePathname: '/',
      trailingSlash: false,
      expect: '/',
    },
  ];

  tests.forEach((t) => {
    const pathname = normalizePathname(t.pathname, t.basePathname, t.trailingSlash);
    assert.equal(pathname, t.expect);
  });
});

test('dynamic, rest pathname in segment', () => {
  const p = getPathname({
    originalPathname: '/blog/start-[...slugId]-end',
    basePathname: '/',
    params: {
      slugId: 'what-is-resumability',
    },
  });
  assert.equal(p, '/blog/start-what-is-resumability-end');
});

test('dynamic rest pathname', () => {
  const p = getPathname({
    originalPathname: '/blog/[...slugId]',
    basePathname: '/',
    params: {
      slugId: 'what-is-resumability',
    },
  });
  assert.equal(p, '/blog/what-is-resumability');
});

test('dynamic, empty rest pathname in root', () => {
  const p = getPathname({
    originalPathname: '/[...id]',
    basePathname: '/',
    params: {
      id: '',
    },
  });
  assert.equal(p, '/');
});

test('dynamic, empty rest pathname in root with nested page', () => {
  const p = getPathname({
    originalPathname: '/[...id]/page',
    basePathname: '/',
    params: {
      id: '',
    },
  });
  assert.equal(p, '/page');
});

test('dynamic pathname', () => {
  const p = getPathname({
    originalPathname: '/docs/[category]/[slugId]',
    basePathname: '/',
    params: {
      category: 'introduction',
      slugId: 'basics',
    },
  });
  assert.equal(p, '/docs/introduction/basics');
});

function getPathname(t: { originalPathname: string; basePathname: string; params?: PathParams }) {
  const p = parseRoutePathname(t.basePathname, t.originalPathname);
  const d = getPathnameForDynamicRoute(t.originalPathname, p.paramNames, t.params);
  return normalizePathname(d, '/', false);
}
