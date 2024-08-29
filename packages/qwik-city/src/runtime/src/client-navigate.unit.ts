import { assert, test } from 'vitest';
import { clientNavigate, newScrollState } from './client-navigate';

test('initialize and push empty scroll history state on navigate', () => {
  const [win, urlOf] = createTestWindow('http://qwik.dev/');
  assert.equal(win.history.state, null);

  const scrollState = newScrollState();

  clientNavigate(win, 'link', urlOf('/'), urlOf('/page-a'));
  assert.deepEqual(win.history.state, { _qCityScroll: scrollState });

  clientNavigate(win, 'link', urlOf('/page-a'), urlOf('/page-b'));
  assert.deepEqual(win.history.state, { _qCityScroll: scrollState });

  win.history.popState(-1);
  clientNavigate(win, 'popstate', urlOf('/page-b'), urlOf('/page-a'));
  assert.deepEqual(win.history.state, { _qCityScroll: scrollState });

  win.history.popState(-1);
  clientNavigate(win, 'popstate', urlOf('/page-a'), urlOf('/'));
  // This will be null, upgrading state only happens in QwikCityProvider.
  // ClientNavigate only pushes new empty states for the scroll handler to use.
  assert.equal(win.history.state, null);

  assert.deepEqual(win.events(), []);
});

test('pushState for different routes', () => {
  const [win, urlOf] = createTestWindow('http://qwik.dev/page-a?search=123');
  assert.equal(win.history.state, null);

  const scrollState = newScrollState();

  clientNavigate(win, 'link', urlOf('/page-a?search=123'), urlOf('/page-b?search=123'));
  assert.deepEqual(win.history.state, { _qCityScroll: scrollState });

  clientNavigate(win, 'link', urlOf('/page-b?search=123'), urlOf('/page-b?param=456'));
  assert.deepEqual(win.history.state, { _qCityScroll: scrollState });

  assert.deepEqual(win.events(), []);
});

test('when passing replaceState', () => {
  const [win, urlOf] = createTestWindow('http://qwik.dev/page-a?search=123');
  assert.equal(win.history.state, null);

  const scrollState = newScrollState();

  const length = win.history.length;
  clientNavigate(win, 'link', urlOf('/page-a?search=123'), urlOf('/page-a?search=456'), true);
  assert.deepEqual(win.history.state, { _qCityScroll: scrollState });
  assert.equal(win.history.length, length);
});

test('pushState for different hash', () => {
  const [win, urlOf] = createTestWindow('http://qwik.dev/page-a?search=123#hash-1');
  assert.equal(win.history.state, null);

  const scrollState = newScrollState();

  clientNavigate(
    win,
    'link',
    urlOf('/page-a?search=123#hash-1'),
    urlOf('/page-b?search=123#hash-2')
  );
  assert.deepEqual(win.history.state, { _qCityScroll: scrollState });
  assert.deepEqual(win.events(), []);

  clientNavigate(
    win,
    'link',
    urlOf('/page-b?search=123#hash-2'),
    urlOf('/page-b?search=123#hash-3')
  );
  assert.deepEqual(win.history.state, { _qCityScroll: scrollState });
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
