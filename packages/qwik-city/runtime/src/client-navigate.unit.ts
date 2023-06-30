import { deepEqual } from 'assert';
import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { clientNavigate, newScrollState } from './client-navigate';

const navTest = suite('clientNavigate');

navTest('initialize and push empty scroll history state on navigate', () => {
  const [win, urlOf] = createTestWindow('http://qwik.dev/');
  equal(win.history.state, null);

  const scrollState = newScrollState();

  clientNavigate(win, 'link', urlOf('/'), urlOf('/page-a'));
  deepEqual(win.history.state, { _qCityScroll: scrollState });

  clientNavigate(win, 'link', urlOf('/page-a'), urlOf('/page-b'));
  deepEqual(win.history.state, { _qCityScroll: scrollState });

  win.history.popState(-1);
  clientNavigate(win, 'popstate', urlOf('/page-b'), urlOf('/page-a'));
  deepEqual(win.history.state, { _qCityScroll: scrollState });

  win.history.popState(-1);
  clientNavigate(win, 'popstate', urlOf('/page-a'), urlOf('/'));
  // This will be null, upgrading state only happens in QwikCityProvider.
  // ClientNavigate only pushes new empty states for the scroll handler to use.
  equal(win.history.state, null);

  equal(win.events(), []);
});

navTest('pushState for different routes', () => {
  const [win, urlOf] = createTestWindow('http://qwik.dev/page-a?search=123');
  equal(win.history.state, null);

  const scrollState = newScrollState();

  clientNavigate(win, 'link', urlOf('/page-a?search=123'), urlOf('/page-b?search=123'));
  deepEqual(win.history.state, { _qCityScroll: scrollState });

  clientNavigate(win, 'link', urlOf('/page-b?search=123'), urlOf('/page-b?param=456'));
  deepEqual(win.history.state, { _qCityScroll: scrollState });

  equal(win.events(), []);
});

navTest('when passing replaceState', () => {
  const [win, urlOf] = createTestWindow('http://qwik.dev/page-a?search=123');
  equal(win.history.state, null);

  const scrollState = newScrollState();

  const length = win.history.length;
  clientNavigate(win, 'link', urlOf('/page-a?search=123'), urlOf('/page-a?search=456'), true);
  deepEqual(win.history.state, { _qCityScroll: scrollState });
  equal(win.history.length, length);
});

navTest('pushState for different hash', () => {
  const [win, urlOf] = createTestWindow('http://qwik.dev/page-a?search=123#hash-1');
  equal(win.history.state, null);

  const scrollState = newScrollState();

  clientNavigate(
    win,
    'link',
    urlOf('/page-a?search=123#hash-1'),
    urlOf('/page-b?search=123#hash-2')
  );
  deepEqual(win.history.state, { _qCityScroll: scrollState });
  equal(win.events(), []);

  clientNavigate(
    win,
    'link',
    urlOf('/page-b?search=123#hash-2'),
    urlOf('/page-b?search=123#hash-3')
  );
  deepEqual(win.history.state, { _qCityScroll: scrollState });
});

function createTestWindow<T>(href: string): [testWindow: TestWindow, urlOf: (path: string) => URL] {
  const events: Event[] = [];
  const historyEntries: { url: URL; state: T | null }[] = [{ url: new URL(href), state: null }];
  let index = 0;

  return [
    {
      HashChangeEvent: class {
        type: 'hashchange';
        newURL: string;
        oldURL: string;
        constructor(type: 'hashchange', { newURL, oldURL }: { newURL: string; oldURL: string }) {
          this.type = type;
          this.newURL = newURL;
          this.oldURL = oldURL;
        }
      },
      events() {
        return events;
      },
      get location() {
        return historyEntries[index].url;
      },
      dispatchEvent: (event: Event) => events.push(event),
      history: {
        popState: (delta: number) => {
          const newIndex = index + delta;
          if (newIndex < 0 || newIndex > historyEntries.length - 1) {
            throw new Error(
              `Invalid change to history position. current: ${index}, delta: ${delta}, length: ${historyEntries.length}`
            );
          }
          index = newIndex;
        },
        pushState: (state: any, _: string, path: string) => {
          ++index;
          historyEntries.push({ url: new URL(path, href), state });
        },
        replaceState: (state: any, _: string, path: string) => {
          historyEntries.splice(historyEntries.length - 1, 1, { url: new URL(path, href), state });
          return historyEntries;
        },
        get length() {
          return historyEntries.length;
        },
        get state() {
          return historyEntries[index].state;
        },
      },
    } as any,
    (path: string) => new URL(path, href),
  ];
}

interface TestWindow extends Window {
  events: () => Event[];
  history: History & { popState: (delta: number) => void };
}

navTest.run();
