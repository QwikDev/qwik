import { parseRoutePathname } from '../../buildtime/routing/parse-pathname';
import { suite, test } from 'uvu';
import { equal } from 'uvu/assert';
import { getRouteParams, getMenuLoader } from './routing';
import type { MenuData } from './types';

const routingTest = suite('routing');

routingTest('matches paths with patterns', () => {
  const tests = [
    {
      basenamePath: '/',
      pattern: '/stuff/[param]',
      path: '/stuff/thing',
      result: {
        param: 'thing',
      },
    },
    {
      basenamePath: '/',
      pattern: '/stuff/[param]',
      path: '/stuff/thing/',
      result: {
        param: 'thing',
      },
    },
    {
      basenamePath: '/',
      pattern: '/stuff/[...param]',
      path: '/stuff/thing/',
      result: {
        param: 'thing/',
      },
    },
  ];

  for (const t of tests) {
    testMatch(t.basenamePath, t.pattern, t.path, t.result);
  }
});

const testMatch = (
  basenamePath: string,
  pattern: string,
  pathname: string,
  result: Record<string, string> | null
) => {
  const actual = parseRoutePathname(basenamePath, pattern);
  const matched = actual.pattern.exec(pathname);
  if (matched === null) {
    equal(result, null);
  } else {
    equal(getRouteParams(actual.paramNames, matched), result);
  }
};

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
