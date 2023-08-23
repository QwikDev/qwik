import { parseRoutePathname } from '../../buildtime/routing/parse-pathname';
import { suite, test } from 'uvu';
import { equal } from 'uvu/assert';
import { getMenuLoader } from './routing';
import type { MenuData } from './types';
import { matchRoute } from './route-matcher';

const routingTest = suite('routing');

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

for (const t of routeTests) {
  routingTest(`matches ${t.pathname} with ${t.pattern}`, () => {
    const actual = parseRoutePathname(t.basenamePath, t.pattern);
    const params = matchRoute(actual.routeName, t.pathname);
    equal(params, t.result);
  });
}

test(`getMenuLoader, crawl up root, trailing slash`, async () => {
  const menus: MenuData[] = [
    ['/foo/bar/', async () => ({ default: { text: 'Bar' } })],
    ['/foo/', async () => ({ default: { text: 'Foo' } })],
    ['/', async () => ({ default: { text: 'Root' } })],
  ];
  const loader = getMenuLoader(menus, '/a/b/c/');
  equal(await loader!(), { default: { text: 'Root' } });
});

test(`getMenuLoader, crawl up root, no trailing slash`, async () => {
  const menus: MenuData[] = [
    ['/foo/bar/', async () => ({ default: { text: 'Bar' } })],
    ['/foo/', async () => ({ default: { text: 'Foo' } })],
    ['/', async () => ({ default: { text: 'Root' } })],
  ];
  const loader = getMenuLoader(menus, '/a/b/c');
  equal(await loader!(), { default: { text: 'Root' } });
});

test(`getMenuLoader, crawl up one, trailing slash`, async () => {
  const menus: MenuData[] = [
    ['/foo/bar/', async () => ({ default: { text: 'Bar' } })],
    ['/foo/', async () => ({ default: { text: 'Foo' } })],
    ['/', async () => ({ default: { text: 'Root' } })],
  ];
  const loader = getMenuLoader(menus, '/foo/no-menu/');
  equal(await loader!(), { default: { text: 'Foo' } });
});

test(`getMenuLoader, crawl up one, no trailing slash`, async () => {
  const menus: MenuData[] = [
    ['/foo/bar/', async () => ({ default: { text: 'Bar' } })],
    ['/foo/', async () => ({ default: { text: 'Foo' } })],
    ['/', async () => ({ default: { text: 'Root' } })],
  ];
  const loader = getMenuLoader(menus, '/foo/no-menu');
  equal(await loader!(), { default: { text: 'Foo' } });
});

test(`getMenuLoader, exact path, trailing slash`, async () => {
  const menus: MenuData[] = [
    ['/foo/bar/', async () => ({ default: { text: 'Bar' } })],
    ['/foo/', async () => ({ default: { text: 'Foo' } })],
    ['/', async () => ({ default: { text: 'Root' } })],
  ];
  const loader = getMenuLoader(menus, '/foo/bar/');
  equal(await loader!(), { default: { text: 'Bar' } });
});

test(`getMenuLoader, exact path, no trailing slash`, async () => {
  const menus: MenuData[] = [
    ['/foo/bar/', async () => ({ default: { text: 'Bar' } })],
    ['/foo/', async () => ({ default: { text: 'Foo' } })],
    ['/', async () => ({ default: { text: 'Root' } })],
  ];
  const loader = getMenuLoader(menus, '/foo/bar');
  equal(await loader!(), { default: { text: 'Bar' } });
});

test(`getMenuLoader, root`, async () => {
  const menus: MenuData[] = [
    ['/foo/bar/', async () => ({ default: { text: 'Bar' } })],
    ['/foo/', async () => ({ default: { text: 'Foo' } })],
    ['/', async () => ({ default: { text: 'Root' } })],
  ];
  const loader = getMenuLoader(menus, '/');
  equal(await loader!(), { default: { text: 'Root' } });
});

routingTest.run();
test.run();
