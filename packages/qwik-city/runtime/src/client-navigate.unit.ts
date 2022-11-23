import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { ClientHistoryWindow, clientNavigate } from './client-navigate';
import { CLIENT_HISTORY_INITIALIZED } from './constants';
import type { RouteNavigate, SimpleURL } from './types';
import { toPath } from './utils';

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
  equal(win.listeners.get('popstate')!.length, 1);
  clientNavigate(win, routeNav);
  equal(win.listeners.get('popstate')!.length, 1);
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
  const listeners = new Map<string, (() => void)[]>();
  const location = new URL(href);
  const historyPaths: string[] = [toPath(location)];

  return {
    addEventListener: (evName: string, cb: () => void) => {
      let evListeners = listeners.get(evName);
      if (!evListeners) {
        evListeners = [];
        listeners.set(evName, evListeners);
      }
      evListeners.push(cb);
    },
    removeEventListener: (evName: string, cb: () => void) => {
      const evListeners = listeners.get(evName);
      if (evListeners) {
        const index = evListeners.indexOf(cb);
        if (index > -1) {
          evListeners.splice(index, 1);
        }
      }
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
          const evListeners = listeners.get('popstate');
          if (evListeners) {
            const cb = evListeners[evListeners.length - 1];
            cb && cb();
          }
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
      const evListeners = listeners.get('popstate');
      if (evListeners) {
        evListeners[evListeners.length - 1]();
      }
    },
    scrollTo: (x: number, y: number) => {},
  } as any;
}

interface TestClientHistoryWindow extends ClientHistoryWindow {
  listeners: TestListeners;
  historyPaths: string[];
  firePopstate: () => void;
}

type TestListeners = Map<string, (() => void)[]>;

function createRouteNavigate(win: { location: SimpleURL }) {
  const routeNav: RouteNavigate = { path: toPath(win.location) };
  return routeNav;
}

navTest.run();
