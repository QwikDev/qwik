import type { BuiltRoute } from '../types';
import { createFileId } from '../../utils/fs';
import { parseRoutePathname } from './parse-pathname';
import { routeSortCompare } from './sort-routes';
import { test, assert } from 'vitest';

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
  assert.deepEqual(actualSame, pathnames);

  const routesReversed = [...pathnames].reverse().map((p) => route({ pathname: p }));
  const actualReversed = routesReversed.sort(routeSortCompare).map((r) => r.pathname);
  assert.deepEqual(actualReversed, pathnames);

  const routesRandom = [...pathnames]
    .sort(() => Math.random() - 0.5)
    .map((p) => route({ pathname: p }));
  const actualRandom = routesRandom.sort(routeSortCompare).map((r) => r.pathname);
  assert.deepEqual(actualRandom, pathnames);
});

function route(r: TestRoute) {
  const pathname = r.pathname || '/';
  const route: BuiltRoute = {
    id: createFileId('', pathname, 'Route'),
    filePath: pathname,
    pathname,
    ext: '.tsx',
    layouts: [],
    ...parseRoutePathname('/', pathname),
  };
  return route;
}

interface TestRoute {
  paramNames?: string[];
  pathname?: string;
}
