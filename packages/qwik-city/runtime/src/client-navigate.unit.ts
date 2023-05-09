import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { resetHistoryId, getHistoryId, clientNavigate } from './client-navigate';

const navTest = suite('clientNavigate');

navTest('update id for pushState and popState', () => {
  const [win, urlOf] = createTestWindow('http://qwik.dev/');
  equal(win.history.state, null);
  equal(getHistoryId(), '0');

  clientNavigate(win, 'link', urlOf('/'), urlOf('/page-a'));
  equal(win.history.state, { id: 1 });
  equal(getHistoryId(), '1');

  clientNavigate(win, 'link', urlOf('/'), urlOf('/page-b'));
  equal(win.history.state, { id: 2 });
  equal(getHistoryId(), '2');

  win.history.popState(-1);
  clientNavigate(win, 'popstate', urlOf('/page-b'), urlOf('/page-a'));
  equal(win.history.state, { id: 1 });
  equal(getHistoryId(), '1');

  win.history.popState(-1);
  clientNavigate(win, 'popstate', urlOf('/page-a'), urlOf('/'));
  equal(win.history.state, null);
  equal(getHistoryId(), '0');

  equal(win.events(), []);
});

navTest('pushState for different routes', () => {
  const [win, urlOf] = createTestWindow('http://qwik.dev/page-a?search=123');
  equal(win.history.state, null);
  equal(getHistoryId(), '0');

  clientNavigate(win, 'link', urlOf('/page-a?search=123'), urlOf('/page-b?search=123'));
  equal(win.history.state, { id: 1 });
  equal(getHistoryId(), '1');

  clientNavigate(win, 'link', urlOf('/page-b?search=123'), urlOf('/page-b?param=456'));
  equal(win.history.state, { id: 2 });
  equal(getHistoryId(), '2');

  equal(win.events(), []);
});

navTest('pushState for different hash', () => {
  const [win, urlOf] = createTestWindow('http://qwik.dev/page-a?search=123#hash-1');
  equal(win.history.state, null);
  equal(getHistoryId(), '0');

  clientNavigate(
    win,
    'link',
    urlOf('/page-a?search=123#hash-1'),
    urlOf('/page-b?search=123#hash-2')
  );
  equal(win.history.state, { id: 1 });
  equal(getHistoryId(), '1');
  equal(win.events(), []);

  clientNavigate(
    win,
    'link',
    urlOf('/page-b?search=123#hash-2'),
    urlOf('/page-b?search=123#hash-3')
  );
  equal(win.history.state, { id: 2 });
  equal(getHistoryId(), '2');
});

function createTestWindow<T>(href: string): [testWindow: TestWindow, urlOf: (path: string) => URL] {
  resetHistoryId();
  const events: Event[] = [];
  const histryEntries: { url: URL; state: T | null }[] = [{ url: new URL(href), state: null }];
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
        return histryEntries[index].url;
      },
      dispatchEvent: (event: Event) => events.push(event),
      history: {
        popState: (delta: number) => {
          const newIndex = index + delta;
          if (newIndex < 0 || newIndex > histryEntries.length - 1) {
            throw new Error(
              `Invalid change to history position. current: ${index}, delta: ${delta}, length: ${histryEntries.length}`
            );
          }
          index = newIndex;
        },
        pushState: (state: any, _: string, path: string) => {
          ++index;
          histryEntries.push({ url: new URL(path, href), state });
        },
        get length() {
          return histryEntries.length;
        },
        get state() {
          return histryEntries[index].state;
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
