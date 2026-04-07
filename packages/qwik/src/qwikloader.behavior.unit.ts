import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test, vi } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const qwikLoader = readFileSync(resolve(__dirname, '../dist/qwikloader.debug.js'), 'utf-8');

type Listener = {
  handler: (ev: any) => unknown;
  options: {
    capture: boolean;
    passive: boolean;
  };
};

function createEventTarget() {
  const listeners = new Map<string, Listener[]>();
  return {
    listeners,
    addEventListener: vi.fn(
      (
        eventName: string,
        handler: (ev: any) => unknown,
        options: { capture: boolean; passive: boolean }
      ) => {
        const registrations = listeners.get(eventName) ?? [];
        registrations.push({ handler, options });
        listeners.set(eventName, registrations);
      }
    ),
    dispatchEvent: vi.fn(),
    querySelectorAll: vi.fn(() => [] as any[]),
  };
}

function bootLoader(document: any, window: any) {
  const CustomEventImpl = class<T = unknown> {
    type: string;
    detail: T | undefined;

    constructor(type: string, init?: { detail?: T }) {
      this.type = type;
      this.detail = init?.detail;
    }
  };

  const IntersectionObserverImpl = class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();

    constructor(_cb: Function) {}
  };

  // eslint-disable-next-line no-new-func
  new Function(
    'window',
    'document',
    'CustomEvent',
    'IntersectionObserver',
    'performance',
    qwikLoader
  )(window, document, CustomEventImpl, IntersectionObserverImpl, { now: () => 1 });
}

function createLoaderEnvironment(initialEvents: string[]) {
  const doc = createEventTarget() as any;
  doc.readyState = 'loading';
  doc.baseURI = 'http://qwik.dev/';
  doc.body = { lastElementChild: null };
  doc.documentElement = {};

  const win = createEventTarget() as any;
  win._qwikEv = [...initialEvents];
  win.requestIdleCallback = undefined;
  win.setTimeout = vi.fn();

  bootLoader(doc, win);

  return { doc, win };
}

function getSingleListener(target: ReturnType<typeof createEventTarget>, eventName: string) {
  const registrations = target.listeners.get(eventName);
  expect(registrations).toBeDefined();
  expect(registrations).toHaveLength(1);
  return registrations![0]!;
}

function getListeners(target: ReturnType<typeof createEventTarget>, eventName: string) {
  const registrations = target.listeners.get(eventName);
  expect(registrations).toBeDefined();
  return registrations!;
}

describe('qwikloader behavior', () => {
  test('registers listeners for each scope and supports late event registration', () => {
    const { doc, win } = createLoaderEnvironment([
      'e:click',
      'ep:touchstart',
      'd:scroll',
      'wp:resize',
    ]);

    expect(getSingleListener(doc, 'click').options).toEqual({
      capture: true,
      passive: false,
    });
    expect(getSingleListener(doc, 'touchstart').options).toEqual({
      capture: true,
      passive: true,
    });
    expect(getSingleListener(doc, 'scroll').options).toEqual({
      capture: true,
      passive: false,
    });
    expect(getSingleListener(win, 'resize').options).toEqual({
      capture: true,
      passive: true,
    });
    expect(getSingleListener(doc, 'readystatechange').options).toEqual({
      capture: false,
      passive: false,
    });

    win._qwikEv.push('w:keyup');

    expect(getSingleListener(win, 'keyup').options).toEqual({
      capture: true,
      passive: false,
    });

    win._qwikEv.push('dp:scroll');

    expect(getListeners(doc, 'scroll')[1].options).toEqual({
      capture: true,
      passive: true,
    });
  });
});
