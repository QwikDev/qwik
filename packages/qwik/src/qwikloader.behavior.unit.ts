import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QwikEvContainerReady } from './core/shared/utils/markers';
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
type QwikEventItem = string | typeof QwikEvContainerReady;

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
    removeEventListener: vi.fn((eventName: string, handler: (ev: any) => unknown) => {
      const registrations = listeners.get(eventName) ?? [];
      listeners.set(
        eventName,
        registrations.filter((registration) => registration.handler !== handler)
      );
    }),
    dispatchEvent: vi.fn((ev: any) => {
      const registrations = listeners.get(ev.type) ?? [];
      for (let i = 0; i < registrations.length; i++) {
        registrations[i]!.handler(ev);
      }
      return true;
    }),
    querySelectorAll: vi.fn(() => [] as any[]),
  };
}

function bootLoader(document: any, window: any) {
  const loaderScript = qwikLoader.replace(/\bimport\(/g, '__import__(');
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
    '__import__',
    loaderScript
  )(
    window,
    document,
    CustomEventImpl,
    IntersectionObserverImpl,
    { now: () => 1 },
    (href: string) => import(/* @vite-ignore */ href)
  );
}

function createLoaderEnvironment(initialEvents: QwikEventItem[]) {
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

function createMockElement(
  parentElement: any,
  attrs: Record<string, string | boolean>,
  handler?: (ev: any, element: any) => unknown,
  scopedKebabName = 'e:click'
) {
  const attributeMap = new Map<string, string>();
  for (const [name, value] of Object.entries(attrs)) {
    if (value === true) {
      attributeMap.set(name, '');
    } else if (typeof value === 'string') {
      attributeMap.set(name, value);
    }
  }

  const element: any = {
    nodeType: 1,
    parentElement,
    isConnected: true,
    getAttribute: (name: string) => attributeMap.get(name) ?? null,
    hasAttribute: (name: string) => attributeMap.has(name),
    closest: (selector: string) => {
      let current = element as any;
      while (current) {
        if (
          selector === '[q\\:container]:not([q\\:container=html]):not([q\\:container=text])' &&
          current.hasAttribute('q:container') &&
          current.getAttribute('q:container') !== 'html' &&
          current.getAttribute('q:container') !== 'text'
        ) {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    },
  };

  if (handler) {
    element._qDispatch = {
      [scopedKebabName]: handler,
    };
  }

  return element;
}

function createMockEvent(target: any, type = 'click', overrides: Partial<any> = {}) {
  return {
    type,
    target,
    bubbles: true,
    cancelBubble: false,
    defaultPrevented: false,
    stopPropagation() {
      this.cancelBubble = true;
    },
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...overrides,
  };
}

async function flushQueuedTasks() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
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

  test('dispatches capture handlers before bubbling handlers without double-running', async () => {
    const { doc } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    const root = createMockElement(
      null,
      {
        'capture:click': true,
      },
      () => logs.push('root capture')
    );
    const parent = createMockElement(
      root,
      {
        'capture:click': true,
      },
      () => logs.push('parent capture')
    );
    const child = createMockElement(parent, {}, () => logs.push('child bubble'));

    await getSingleListener(doc, 'click').handler(createMockEvent(child));

    expect(logs).toEqual(['root capture', 'parent capture', 'child bubble']);
  });

  test('stops propagation after a capture handler calls stopPropagation', async () => {
    const { doc } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    const root = createMockElement(
      null,
      {
        'capture:click': true,
      },
      () => logs.push('root capture')
    );
    const parent = createMockElement(
      root,
      {
        'capture:click': true,
      },
      (ev) => {
        logs.push('parent capture');
        ev.stopPropagation();
      }
    );
    const child = createMockElement(parent, {}, () => logs.push('child bubble'));

    await getSingleListener(doc, 'click').handler(createMockEvent(child));

    expect(logs).toEqual(['root capture', 'parent capture']);
  });

  test('stops propagation for async bubbling handlers when stoppropagation attribute is set', async () => {
    const { doc } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    const root = createMockElement(null, {}, () => logs.push('root bubble'));
    const child = createMockElement(
      root,
      {
        'stoppropagation:click': true,
      },
      async () => {
        logs.push('child bubble');
      }
    );

    await getSingleListener(doc, 'click').handler(createMockEvent(child));

    expect(logs).toEqual(['child bubble']);
  });

  test('a deferred (importing) handler that stops propagation skips a later deferred ancestor', async () => {
    const { doc } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    const previousLogs = (globalThis as any).__qwikLoaderStopLogs;
    // Both handlers load via QRL import, so neither runs during the synchronous bubbling walk — they
    // run only when their per-element task group flushes. The child stops propagation after its
    // import resolves; the fix's `cancelBubble` re-check between groups must then skip the ancestor.
    const childModule = `data:text/javascript;charset=utf-8,${encodeURIComponent(
      'export const handler = (ev) => { ev.stopPropagation(); globalThis.__qwikLoaderStopLogs.push("child stop"); };'
    )}`;
    const parentModule = `data:text/javascript;charset=utf-8,${encodeURIComponent(
      'export const handler = () => globalThis.__qwikLoaderStopLogs.push("parent bubble");'
    )}`;
    const container = createMockElement(null, { 'q:container': 'resumed', 'q:base': './' });
    const parent = createMockElement(container, { 'q-e:click': `${parentModule}#handler#` });
    const child = createMockElement(parent, { 'q-e:click': `${childModule}#handler#` });

    (globalThis as any).__qwikLoaderStopLogs = logs;
    try {
      getSingleListener(doc, 'click').handler(createMockEvent(child));
      await vi.waitFor(() => {
        expect(logs).toContain('child stop');
      });
      await flushQueuedTasks();
      // Pre-fix the ancestor's group flushed unconditionally and 'parent bubble' was logged.
      expect(logs).toEqual(['child stop']);
    } finally {
      (globalThis as any).__qwikLoaderStopLogs = previousLogs;
    }
  });

  test('a deferred (importing) handler that does not stop still runs the deferred ancestor', async () => {
    const { doc } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    const previousLogs = (globalThis as any).__qwikLoaderStopLogs;
    const childModule = `data:text/javascript;charset=utf-8,${encodeURIComponent(
      'export const handler = () => globalThis.__qwikLoaderStopLogs.push("child run");'
    )}`;
    const parentModule = `data:text/javascript;charset=utf-8,${encodeURIComponent(
      'export const handler = () => globalThis.__qwikLoaderStopLogs.push("parent bubble");'
    )}`;
    const container = createMockElement(null, { 'q:container': 'resumed', 'q:base': './' });
    const parent = createMockElement(container, { 'q-e:click': `${parentModule}#handler#` });
    const child = createMockElement(parent, { 'q-e:click': `${childModule}#handler#` });

    (globalThis as any).__qwikLoaderStopLogs = logs;
    try {
      getSingleListener(doc, 'click').handler(createMockEvent(child));
      await vi.waitFor(() => {
        expect(logs).toEqual(['child run', 'parent bubble']);
      });
    } finally {
      (globalThis as any).__qwikLoaderStopLogs = previousLogs;
    }
  });

  test('applies parent preventdefault synchronously before async child bubbling completes', async () => {
    const { doc } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    let resolveChild!: () => void;
    const anchor = createMockElement(
      null,
      {
        'preventdefault:click': true,
      },
      () => logs.push('parent'),
      'e:click'
    );
    const button = createMockElement(
      anchor,
      {},
      async () => {
        logs.push('child');
        await new Promise<void>((resolve) => {
          resolveChild = resolve;
        });
      },
      'e:click'
    );

    const event = createMockEvent(button);
    const result = getSingleListener(doc, 'click').handler(event);

    expect(event.defaultPrevented).toBe(true);
    expect(logs).toEqual(['child', 'parent']);

    resolveChild();
    await result;
  });

  test('runs ancestor sync qrls synchronously even after a child async handler', async () => {
    const { doc } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    let resolveChild!: () => void;
    (doc as any).qFuncs_sync = [
      () => {
        logs.push('parent sync');
      },
    ];
    const container = createMockElement(null, {
      'q:container': '',
      'q:base': './',
      'q:instance': 'sync',
    });
    const anchor = createMockElement(container, {
      'q-e:click': '#0#',
    });
    const button = createMockElement(
      anchor,
      {},
      async () => {
        logs.push('child async');
        await new Promise<void>((resolve) => {
          resolveChild = resolve;
        });
      },
      'e:click'
    );

    const result = getSingleListener(doc, 'click').handler(createMockEvent(button));

    expect(logs).toEqual(['child async', 'parent sync']);

    resolveChild();
    await result;
  });

  test('waits for streamed container data before running qrl attributes', async () => {
    const { doc, win } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    const container = createMockElement(null, {
      'q:container': 'paused',
      'q:base': './',
      'q:instance': 'sync',
    });
    const button = createMockElement(container, {
      'q-e:click': '#0#',
    });

    getSingleListener(doc, 'click').handler(createMockEvent(button));

    expect(logs).toEqual([]);
    expect(doc.dispatchEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'qerror' }));

    doc.qFuncs_sync = [
      () => {
        logs.push('clicked');
      },
    ];
    win._qwikEv.push(QwikEvContainerReady, 'sync');
    await flushQueuedTasks();

    expect(logs).toEqual(['clicked']);
  });

  test('waits for streamed container data before running chunked qrl attributes', async () => {
    const { doc, win } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    const previousLogs = (globalThis as any).__qwikLoaderChunkLogs;
    const moduleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(
      'export const handler = () => globalThis.__qwikLoaderChunkLogs.push("clicked");'
    )}`;
    const container = createMockElement(null, {
      'q:container': 'paused',
      'q:base': './',
      'q:instance': 'chunked',
    });
    const button = createMockElement(container, {
      'q-e:click': `${moduleUrl}#handler#`,
    });

    (globalThis as any).__qwikLoaderChunkLogs = logs;
    try {
      getSingleListener(doc, 'click').handler(createMockEvent(button));
      await flushQueuedTasks();

      expect(logs).toEqual([]);

      win._qwikEv.push(QwikEvContainerReady, 'chunked');
      await vi.waitFor(() => {
        expect(logs).toEqual(['clicked']);
      });
    } finally {
      (globalThis as any).__qwikLoaderChunkLogs = previousLogs;
    }
  });

  test('falls back to readystatechange while waiting for streamed container data', async () => {
    const { doc } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    const container = createMockElement(null, {
      'q:container': 'paused',
      'q:base': './',
      'q:instance': 'sync',
    });
    const button = createMockElement(container, {
      'q-e:click': '#0#',
    });

    getSingleListener(doc, 'click').handler(createMockEvent(button));

    expect(logs).toEqual([]);

    doc.qFuncs_sync = [
      () => {
        logs.push('clicked');
      },
    ];
    doc.readyState = 'interactive';
    const listeners = getListeners(doc, 'readystatechange');
    for (let i = 0; i < listeners.length; i++) {
      listeners[i]!.handler(createMockEvent(doc, 'readystatechange'));
    }
    await flushQueuedTasks();

    expect(logs).toEqual(['clicked']);
  });

  test('waits only for the streamed container that owns the qready command', async () => {
    const { doc, win } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    const firstContainer = createMockElement(null, {
      'q:container': 'paused',
      'q:base': './',
      'q:instance': 'first',
    });
    const secondContainer = createMockElement(null, {
      'q:container': 'paused',
      'q:base': './',
      'q:instance': 'second',
    });
    const firstButton = createMockElement(firstContainer, {
      'q-e:click': '#0#',
    });
    const secondButton = createMockElement(secondContainer, {
      'q-e:click': '#0#',
    });

    getSingleListener(doc, 'click').handler(createMockEvent(firstButton));
    getSingleListener(doc, 'click').handler(createMockEvent(secondButton));

    expect(logs).toEqual([]);
    expect(doc.dispatchEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'qerror' }));

    doc.qFuncs_first = [
      () => {
        logs.push('first');
      },
    ];
    doc.qFuncs_second = [
      () => {
        logs.push('second');
      },
    ];

    win._qwikEv.push(QwikEvContainerReady, 'first');
    await flushQueuedTasks();

    expect(logs).toEqual(['first']);
    expect(doc.dispatchEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'qerror' }));

    win._qwikEv.push(QwikEvContainerReady, 'second');
    await flushQueuedTasks();

    expect(logs).toEqual(['first', 'second']);
  });
});
