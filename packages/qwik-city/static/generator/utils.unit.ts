import { parseRoutePathname } from '../../buildtime/routing/parse-pathname';
import { test } from 'uvu';
import { equal } from 'uvu/assert';
import { getPathnameForDynamicRoute, msToString, normalizePathname } from './utils';
import type { RouteParams } from '../../runtime/src';

test('normalizePathname', () => {
  const tests = [
    {
      pathname: '/about.html',
      baseUrl: 'https://qwik.builder.io/site/',
      trailingSlash: true,
      expect: '/site/about.html',
    },
    {
      pathname: '/about.html',
      baseUrl: 'https://qwik.builder.io/site/',
      trailingSlash: false,
      expect: '/site/about.html',
    },
    {
      pathname: '/about',
      baseUrl: 'https://qwik.builder.io/site/',
      trailingSlash: true,
      expect: '/site/about/',
    },
    {
      pathname: '/about/',
      baseUrl: 'https://qwik.builder.io/site/',
      trailingSlash: false,
      expect: '/site/about',
    },
    {
      pathname: '/',
      baseUrl: 'https://qwik.builder.io/site/',
      trailingSlash: true,
      expect: '/site/',
    },
    {
      pathname: '/',
      baseUrl: 'https://qwik.builder.io/site/',
      trailingSlash: false,
      expect: '/site',
    },
    {
      pathname: '/',
      baseUrl: 'https://qwik.builder.io/',
      trailingSlash: true,
      expect: '/',
    },
    {
      pathname: '/',
      baseUrl: 'https://qwik.builder.io/',
      trailingSlash: false,
      expect: '/',
    },
  ];

  tests.forEach((t) => {
    const pathname = normalizePathname(
      { trailingSlash: t.trailingSlash, outDir: '', baseUrl: t.baseUrl },
      t.pathname
    );
    equal(pathname, t.expect);
  });
});

test('dynamic, rest pathname in segment', () => {
  const p = getPathname({
    originalPathname: '/blog/start-[...slugId]-end',
    params: {
      slugId: 'what-is-resumability',
    },
  });
  equal(p, '/blog/start-what-is-resumability-end');
});

test('dynamic rest pathname', () => {
  const p = getPathname({
    originalPathname: '/blog/[...slugId]',
    params: {
      slugId: 'what-is-resumability',
    },
  });
  equal(p, '/blog/what-is-resumability');
});

test('dynamic pathname', () => {
  const p = getPathname({
    originalPathname: '/docs/[category]/[slugId]',
    params: {
      category: 'introduction',
      slugId: 'basics',
    },
  });
  equal(p, '/docs/introduction/basics');
});

function getPathname(t: { originalPathname: string; params?: RouteParams }) {
  const p = parseRoutePathname(t.originalPathname);
  return getPathnameForDynamicRoute(t.originalPathname, p.paramNames, t.params);
}

test('msToString', () => {
  const tests = [
    {
      ms: 0.05,
      expect: '0.05 ms',
    },
    {
      ms: 10.5,
      expect: '10.5 ms',
    },
    {
      ms: 100,
      expect: '100.0 ms',
    },
    {
      ms: 2000,
      expect: '2.0 s',
    },
    {
      ms: 120000,
      expect: '2.0 m',
    },
  ];

  tests.forEach((t) => {
    equal(msToString(t.ms), t.expect);
  });
});

test.run();
