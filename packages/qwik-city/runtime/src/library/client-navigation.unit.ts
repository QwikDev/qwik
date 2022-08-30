import { test, suite } from 'uvu';
import { equal } from 'uvu/assert';
import {
  ClientHistoryWindow,
  clientNavigate,
  CLIENT_HISTORY_INITIALIZED,
  getClientEndpointPath,
  getClientNavPath,
  isSameOriginDifferentPath,
  SimpleURL,
  toPath,
} from './client-navigation';
import type { RouteNavigate } from './types';

const navTest = suite('clientNavigate');

navTest('do not popstate if location is the same', () => {
  const win = createTestWindow('http://qwik.dev/');
  const routeNav = createRouteNavigate(win);
  routeNav.path = '/page-a';
  clientNavigate(win, routeNav);
  equal(win.location.href, 'http://qwik.dev/page-a');
  win.firePopstate();
  win.firePopstate();
  win.firePopstate();
  routeNav.path = '/page-a';
});

navTest('pushState, popstate', () => {
  const win = createTestWindow('http://qwik.dev/');
  const routeNav = createRouteNavigate(win);
  clientNavigate(win, routeNav);
  routeNav.path = '/page-a';
  clientNavigate(win, routeNav);
  win.history.back();
  equal(win.historyPaths.length, 1);
  equal(win.historyPaths[0], '/');
  equal(win.location.href, 'http://qwik.dev/');
  equal(routeNav.path, '/');
});

navTest('pushState for different path', () => {
  const win = createTestWindow('http://qwik.dev/');
  const routeNav = createRouteNavigate(win);
  clientNavigate(win, routeNav);
  equal(win.historyPaths.length, 1);
  equal(routeNav.path, '/');
  routeNav.path = '/page-a';
  clientNavigate(win, routeNav);
  equal(routeNav.path, '/page-a');
  equal(win.historyPaths.length, 2);
  equal(win.historyPaths[1], '/page-a');
  equal(win.location.href, 'http://qwik.dev/page-a');
  equal(routeNav.path, '/page-a');
});

navTest('do not pushState for same path', () => {
  const win = createTestWindow('http://qwik.dev/');
  const routeNav = createRouteNavigate(win);
  clientNavigate(win, routeNav);
  equal(win.historyPaths.length, 1);
  clientNavigate(win, routeNav);
  equal(win.historyPaths.length, 1);
  equal(routeNav.path, '/');
});

navTest('add only one popstate listener', () => {
  const win = createTestWindow('http://qwik.dev/');
  const routeNav = createRouteNavigate(win);
  clientNavigate(win, routeNav);
  equal(win.listeners.length, 1);
  clientNavigate(win, routeNav);
  equal(win.listeners.length, 1);
  equal(win[CLIENT_HISTORY_INITIALIZED], 1);
});

navTest('test mock window', () => {
  const win = createTestWindow('http://qwik.dev/');
  let calledPopstate = false;
  win.addEventListener('popstate', () => {
    calledPopstate = true;
  });
  equal(win.location.href, 'http://qwik.dev/');
  equal(win.history.length, 1);
  equal(win.history.state, '/');
  equal(calledPopstate, false);
  win.history.pushState('', '', '/page-a');
  equal(win.location.href, 'http://qwik.dev/page-a');
  equal(win.history.length, 2);
  equal(win.history.state, '/page-a');
  equal(calledPopstate, false);
  win.history.back();
  equal(win.location.href, 'http://qwik.dev/');
  equal(win.history.length, 1);
  equal(win.history.state, '/');
  equal(calledPopstate, true);
});

function createTestWindow(href: string): TestClientHistoryWindow {
  const listeners: (() => void)[] = [];
  const location = new URL(href);
  const historyPaths: string[] = [toPath(location)];

  return {
    addEventListener: (evName: string, cb: () => void) => {
      listeners.push(cb);
    },
    get location() {
      return location;
    },
    document: {
      getElementById: () => null,
    },
    history: {
      pushState: (_data: any, _: string, path: string) => {
        historyPaths.push(path);
        location.href = new URL(path, href).href;
      },
      back: () => {
        if (historyPaths.length > 1) {
          historyPaths.pop()!;
          location.href = new URL(historyPaths[historyPaths.length - 1], href).href;
          const cb = listeners[listeners.length - 1];
          cb && cb();
        }
      },
      get length() {
        return historyPaths.length;
      },
      get state() {
        return historyPaths[historyPaths.length - 1];
      },
    },
    listeners,
    historyPaths,
    firePopstate: () => {
      listeners[listeners.length - 1]();
    },
  } as any;
}

interface TestClientHistoryWindow extends ClientHistoryWindow {
  listeners: (() => void)[];
  historyPaths: string[];
  firePopstate: () => void;
}

function createRouteNavigate(win: { location: SimpleURL }) {
  const routeNav: RouteNavigate = { path: toPath(win.location) };
  return routeNav;
}

navTest.run();

test('isSameOriginDifferentPath', () => {
  const compare = [
    {
      a: 'http://qwik.dev/',
      b: 'http://qwik.dev/',
      expect: false,
    },
    {
      a: 'http://qwik.dev/',
      b: 'http://b.io/',
      expect: false,
    },
    {
      a: 'http://qwik.dev/',
      b: 'http://b.io/path-b',
      expect: false,
    },
    {
      a: 'http://qwik.dev/path-a',
      b: 'http://qwik.dev/path-b',
      expect: true,
    },
    {
      a: 'http://qwik.dev/qs=a',
      b: 'http://qwik.dev/qs=b',
      expect: true,
    },
    {
      a: 'http://qwik.dev/qs=a',
      b: 'http://qwik.dev/qs=a',
      expect: false,
    },
    {
      a: 'http://qwik.dev/qs=a#hash1',
      b: 'http://qwik.dev/qs=b#hash1',
      expect: true,
    },
    {
      a: 'http://qwik.dev/qs=a#hash1',
      b: 'http://qwik.dev/qs=a#hash1',
      expect: false,
    },
    {
      a: 'http://qwik.dev/qs=a#hash1',
      b: 'http://qwik.dev/qs=a#hash2',
      expect: true,
    },
  ];

  compare.forEach((c) => {
    const a = new URL(c.a);
    const b = new URL(c.b);
    equal(isSameOriginDifferentPath(a, b), c.expect, `${a} ${b}`);
  });
});

const baseUrl = new URL('https://qwik.dev/');
[
  { props: { href: '#hash' }, expect: '/#hash' },
  { props: { href: '?qs=true' }, expect: '/?qs=true' },
  { props: { href: '/abs-path' }, expect: '/abs-path' },
  { props: { href: './rel-path' }, expect: '/rel-path' },
  { props: { href: 'rel-path' }, expect: '/rel-path' },
  { props: { href: '/path/../rel-path' }, expect: '/rel-path' },
  { props: { href: '/abs-path', target: '_blank' }, expect: null },
  { props: { href: 'http://qwik.dev/' }, expect: null },
  { props: { href: 'http://builder.io/' }, expect: null },
  { props: { href: '       ' }, expect: null },
  { props: { href: '       ' }, expect: null },
  { props: { href: '' }, expect: null },
  { props: { href: null }, expect: null },
  { props: {}, expect: null },
].forEach((c) => {
  test(`getClientNavPath ${c.props.href}`, () => {
    equal(getClientNavPath(c.props, baseUrl), c.expect, `${c.props.href} ${c.expect}`);
  });
});

[
  { pathname: '/', expect: '/q-data.json' },
  { pathname: '/about', expect: '/about/q-data.json' },
  { pathname: '/about#hash', expect: '/about/q-data.json' },
  { pathname: '/about?qs=true', expect: '/about/q-data.json' },
  { pathname: '/about/#hash', expect: '/about/q-data.json' },
  { pathname: '/about/?qs=true', expect: '/about/q-data.json' },
  { pathname: '/about/', expect: '/about/q-data.json' },
].forEach((t) => {
  test(`getClientEndpointUrl("${t.pathname}")`, () => {
    const baseUrl = new URL('https://qwik.builder.io/');
    const url = getClientEndpointPath(t.pathname, baseUrl);
    equal(url, t.expect);
  });
});

test.run();
