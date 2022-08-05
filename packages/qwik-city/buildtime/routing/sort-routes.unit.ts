import { test } from 'uvu';
import { equal } from 'uvu/assert';
import type { BuildRoute } from '../types';
import { parseRoutePathname } from './parse-pathname';
import { routeSortCompare } from './sort-routes';

test('routeSortCompare', () => {
  const pathnames = [
    '/',
    '/about',
    '/blog',
    '/blog/bar',
    '/blog/foo',
    '/blog/p[yyy].json',
    '/blog/p[xxx]',
    '/blog/p[yyy]',
    '/blog/p[zzz]',
    '/blog/[slug]',
    '/[aaa]',
    '/[bbb]',
    '/[ccc]',
    '/[...rest1]/lmn/[...deep_rest]/xyz',
    '/[...rest1]/lmn/[...deep_rest]',
    '/[...rest1]/abc',
    '/[...rest1]/lmn',
    '/[...rest2]',
    '/[...rest]',
  ];

  const routesSame = [...pathnames].map((p) => route({ pathname: p }));
  const actualSame = routesSame.sort(routeSortCompare).map((r) => r.pathname);
  equal(actualSame, pathnames);

  const routesReversed = [...pathnames].reverse().map((p) => route({ pathname: p }));
  const actualReversed = routesReversed.sort(routeSortCompare).map((r) => r.pathname);
  equal(actualReversed, pathnames);

  const routesRandom = [...pathnames]
    .sort(() => Math.random() - 0.5)
    .map((p) => route({ pathname: p }));
  const actualRandom = routesRandom.sort(routeSortCompare).map((r) => r.pathname);
  equal(actualRandom, pathnames);
});

test(`endpoint > page`, async () => {
  const a = route({ type: 'endpoint' });
  const b = route({ type: 'page' });
  equal(routeSortCompare(a, b), -1);
  equal(routeSortCompare(b, a), 1);
});

function route(r: TestRoute) {
  const pathname = r.pathname || '/';
  const route: BuildRoute = {
    type: r.type || 'page',
    id: pathname,
    filePath: pathname,
    pathname,
    layouts: [],
    ...parseRoutePathname(pathname),
  };
  return route;
}

interface TestRoute {
  type?: 'page' | 'endpoint';
  paramNames?: string[];
  pathname?: string;
}

test.run();
