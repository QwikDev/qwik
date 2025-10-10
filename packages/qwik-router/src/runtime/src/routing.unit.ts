import { assert, describe, test } from 'vitest';
import { parseRoutePathname } from '../../buildtime/routing/parse-pathname';
import { getMenuLoader } from './routing';
import type { MenuData } from './types';
import { matchRoute } from './route-matcher';

const routeTests = [
  {
    basenamePath: '/',
    pattern: '/stuff/[param]',
    pathname: '/stuff/thing',
    result: {
      param: 'thing',
    },
  },
  {
    basenamePath: '/',
    pattern: '/stuff/[param]',
    pathname: '/stuff/thing/',
    result: {
      param: 'thing',
    },
  },
  {
    basenamePath: '/',
    pattern: '/stuff/[...param]',
    pathname: '/stuff/a/b/c/',
    result: {
      param: 'a/b/c',
    },
  },
  {
    basenamePath: '/',
    pattern: '/stuff/[...param]',
    pathname: '/stuff/a/b/c',
    result: {
      param: 'a/b/c',
    },
  },
  {
    basenamePath: '/',
    pattern: '/stuff/[...param]',
    pathname: '/stuff/',
    result: {
      param: '',
    },
  },
  {
    basenamePath: '/',
    pattern: '/stuff/[...param]',
    pathname: '/stuff',
    result: {
      param: '',
    },
  },
  {
    basenamePath: '/',
    pattern: '/[...param]',
    pathname: '/thing/',
    result: {
      param: 'thing',
    },
  },
  {
    basenamePath: '/',
    pattern: '/[...param]',
    pathname: '/thing',
    result: {
      param: 'thing',
    },
  },
  {
    basenamePath: '/',
    pattern: '/xyz/[...param]',
    pathname: '/xyz/abc.dot',
    result: {
      param: 'abc.dot',
    },
  },
  {
    basenamePath: '/',
    pattern: '/[...param]',
    pathname: '/abc.dot',
    result: {
      param: 'abc.dot',
    },
  },
  {
    basenamePath: '/',
    pattern: '/[param]',
    pathname: '/abc.dot',
    result: {
      param: 'abc.dot',
    },
  },
  {
    basenamePath: '/',
    pattern: '/xyz/[param]',
    pathname: '/xyz/abc.dot',
    result: {
      param: 'abc.dot',
    },
  },
];

describe('routing', () => {
  for (const t of routeTests) {
    test(`matches ${t.pathname} with ${t.pattern}`, () => {
      const actual = parseRoutePathname(t.basenamePath, t.pattern);
      const params = matchRoute(actual.routeName, t.pathname);
      assert.deepEqual(params, t.result);
    });
  }
});

test(`getMenuLoader, crawl up root, trailing slash`, async () => {
  const menus: MenuData[] = [
    ['/foo/bar/', async () => ({ default: { text: 'Bar' } })],
    ['/foo/', async () => ({ default: { text: 'Foo' } })],
    ['/', async () => ({ default: { text: 'Root' } })],
  ];
  const loader = getMenuLoader(menus, '/a/b/c/');
  assert.deepEqual(await loader!(), { default: { text: 'Root' } });
});

test(`getMenuLoader, crawl up root, no trailing slash`, async () => {
  const menus: MenuData[] = [
    ['/foo/bar/', async () => ({ default: { text: 'Bar' } })],
    ['/foo/', async () => ({ default: { text: 'Foo' } })],
    ['/', async () => ({ default: { text: 'Root' } })],
  ];
  const loader = getMenuLoader(menus, '/a/b/c');
  assert.deepEqual(await loader!(), { default: { text: 'Root' } });
});

test(`getMenuLoader, crawl up one, trailing slash`, async () => {
  const menus: MenuData[] = [
    ['/foo/bar/', async () => ({ default: { text: 'Bar' } })],
    ['/foo/', async () => ({ default: { text: 'Foo' } })],
    ['/', async () => ({ default: { text: 'Root' } })],
  ];
  const loader = getMenuLoader(menus, '/foo/no-menu/');
  assert.deepEqual(await loader!(), { default: { text: 'Foo' } });
});

test(`getMenuLoader, crawl up one, no trailing slash`, async () => {
  const menus: MenuData[] = [
    ['/foo/bar/', async () => ({ default: { text: 'Bar' } })],
    ['/foo/', async () => ({ default: { text: 'Foo' } })],
    ['/', async () => ({ default: { text: 'Root' } })],
  ];
  const loader = getMenuLoader(menus, '/foo/no-menu');
  assert.deepEqual(await loader!(), { default: { text: 'Foo' } });
});

test(`getMenuLoader, exact path, trailing slash`, async () => {
  const menus: MenuData[] = [
    ['/foo/bar/', async () => ({ default: { text: 'Bar' } })],
    ['/foo/', async () => ({ default: { text: 'Foo' } })],
    ['/', async () => ({ default: { text: 'Root' } })],
  ];
  const loader = getMenuLoader(menus, '/foo/bar/');
  assert.deepEqual(await loader!(), { default: { text: 'Bar' } });
});

test(`getMenuLoader, exact path, no trailing slash`, async () => {
  const menus: MenuData[] = [
    ['/foo/bar/', async () => ({ default: { text: 'Bar' } })],
    ['/foo/', async () => ({ default: { text: 'Foo' } })],
    ['/', async () => ({ default: { text: 'Root' } })],
  ];
  const loader = getMenuLoader(menus, '/foo/bar');
  assert.deepEqual(await loader!(), { default: { text: 'Bar' } });
});

test(`getMenuLoader, root`, async () => {
  const menus: MenuData[] = [
    ['/foo/bar/', async () => ({ default: { text: 'Bar' } })],
    ['/foo/', async () => ({ default: { text: 'Foo' } })],
    ['/', async () => ({ default: { text: 'Root' } })],
  ];
  const loader = getMenuLoader(menus, '/');
  assert.deepEqual(await loader!(), { default: { text: 'Root' } });
});
