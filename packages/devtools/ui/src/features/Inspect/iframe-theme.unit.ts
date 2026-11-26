import { afterEach, expect, test, vi } from 'vitest';
import { setupIframeThemeSync } from './iframe-theme';

afterEach(() => vi.unstubAllGlobals());

function createIframeThemeFixture() {
  const observers: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] =
    [];
  vi.stubGlobal(
    'MutationObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor() {
        observers.push(this);
      }
    }
  );
  vi.stubGlobal('document', {
    documentElement: {
      classList: { contains: () => false },
      getAttribute: () => null,
    },
  });
  const win = Object.assign(new EventTarget(), { localStorage: { setItem: vi.fn() } });
  const doc = {
    defaultView: win,
    documentElement: { classList: { remove: vi.fn() } },
    getElementById: () => ({}),
    body: {},
  };
  setupIframeThemeSync({
    contentDocument: doc,
    contentWindow: win,
  } as unknown as HTMLIFrameElement);
  return { observers, win };
}

test('disconnects theme observers when the inspected page is hidden', () => {
  const { observers, win } = createIframeThemeFixture();
  win.dispatchEvent(new Event('pagehide'));
  expect(observers).toHaveLength(2);
  for (const observer of observers) {
    expect(observer.disconnect).toHaveBeenCalledOnce();
  }
});

test('keeps theme observers connected when the page enters the back-forward cache', () => {
  const { observers, win } = createIframeThemeFixture();
  const pagehide = new Event('pagehide');
  Object.defineProperty(pagehide, 'persisted', { value: true });

  win.dispatchEvent(pagehide);

  for (const observer of observers) {
    expect(observer.disconnect).not.toHaveBeenCalled();
  }
});
