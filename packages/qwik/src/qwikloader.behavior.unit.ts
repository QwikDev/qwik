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

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createMockElement(
  parentElement: any,
  attrs: Record<string, string | boolean>,
  handler?:
    | ((ev: any, element: any) => unknown)
    | Array<((ev: any, element: any) => unknown) | undefined>
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
  };

  if (handler) {
    element._qDispatch = {
      'e:click': handler,
    };
  }

  return element;
}

function setDispatch(
  element: any,
  scopedName: string,
  handler:
    | ((ev: any, element: any) => unknown)
    | Array<((ev: any, element: any) => unknown) | undefined>
) {
  element._qDispatch = {
    ...element._qDispatch,
    [scopedName]: handler,
  };
  return element;
}

function createMockContainer(attrs: Record<string, string>) {
  return {
    _qwikjson_: undefined,
    getAttribute: (name: string) => attrs[name] ?? null,
  };
}

function createMockEvent(target: any, overrides: Partial<any> = {}) {
  return {
    type: 'click',
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

  test('runs _qDispatch handler arrays in order and skips empty entries', async () => {
    const { doc } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    const child = createMockElement(null, {}, [
      () => logs.push('first'),
      undefined,
      () => logs.push('second'),
    ]);

    await getSingleListener(doc, 'click').handler(createMockEvent(child));

    expect(logs).toEqual(['first', 'second']);
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

  test('runs target non-capture handlers for non-bubbling events without reaching ancestors', async () => {
    const { doc } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    const root = createMockElement(null, {}, () => logs.push('root bubble'));
    const child = createMockElement(root, {}, () => logs.push('child bubble'));

    await getSingleListener(doc, 'click').handler(createMockEvent(child, { bubbles: false }));

    expect(logs).toEqual(['child bubble']);
  });

  test('ignores non-bubbling events without an element target', async () => {
    const { doc } = createLoaderEnvironment(['e:click']);

    expect(
      getSingleListener(doc, 'click').handler(
        createMockEvent(
          {
            nodeType: 9,
            parentElement: null,
          },
          { bubbles: false }
        )
      )
    ).toBeUndefined();
  });

  test('prevents default before awaiting child handlers when an ancestor requires it', async () => {
    const { doc } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    const childDeferred = createDeferred();
    const parent = createMockElement(
      null,
      {
        'preventdefault:click': true,
      },
      () => logs.push('parent bubble')
    );
    const child = createMockElement(parent, {}, async () => {
      logs.push('child start');
      await childDeferred.promise;
      logs.push('child end');
    });
    const event = createMockEvent(child);

    const result = getSingleListener(doc, 'click').handler(event);

    expect(event.defaultPrevented).toBe(true);
    expect(logs).toEqual(['child start']);

    childDeferred.resolve();
    await result;

    expect(logs).toEqual(['child start', 'child end', 'parent bubble']);
  });

  test('stops propagation before awaiting child handlers when an ancestor requires it', async () => {
    const { doc } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    const childDeferred = createDeferred();
    const root = createMockElement(null, {}, () => logs.push('root bubble'));
    const parent = createMockElement(
      root,
      {
        'stoppropagation:click': true,
      },
      () => logs.push('parent bubble')
    );
    const child = createMockElement(parent, {}, async () => {
      logs.push('child start');
      await childDeferred.promise;
      logs.push('child end');
    });
    const event = createMockEvent(child);

    const result = getSingleListener(doc, 'click').handler(event);

    expect(event.cancelBubble).toBe(true);
    expect(logs).toEqual(['child start']);

    childDeferred.resolve();
    await result;

    expect(logs).toEqual(['child start', 'child end', 'parent bubble']);
  });

  test('keeps async completion order aligned with invocation order across events', async () => {
    const { doc } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    const firstDeferred = createDeferred();
    const secondDeferred = createDeferred();
    const firstParent = createMockElement(null, {}, () => logs.push('first parent'));
    const first = createMockElement(firstParent, {}, () => firstDeferred.promise);
    const secondParent = createMockElement(null, {}, () => logs.push('second parent'));
    const second = createMockElement(secondParent, {}, () => secondDeferred.promise);

    const firstResult = getSingleListener(doc, 'click').handler(createMockEvent(first));
    const secondResult = getSingleListener(doc, 'click').handler(createMockEvent(second));

    secondDeferred.resolve();
    await Promise.resolve();
    expect(logs).toEqual([]);

    firstDeferred.resolve();
    await firstResult;
    await secondResult;

    expect(logs).toEqual(['first parent', 'second parent']);
  });

  test('keeps later sync work immediate while queuing later async continuations', async () => {
    const { doc } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    const firstDeferred = createDeferred();
    const secondDeferred = createDeferred();
    const firstParent = createMockElement(null, {}, () => logs.push('first parent'));
    const first = createMockElement(firstParent, {}, () => firstDeferred.promise);
    const secondParent = createMockElement(null, {}, () => logs.push('second parent'));
    const second = createMockElement(secondParent, {}, [
      () => logs.push('second sync'),
      () => secondDeferred.promise,
    ]);

    const firstResult = getSingleListener(doc, 'click').handler(createMockEvent(first));
    const secondResult = getSingleListener(doc, 'click').handler(createMockEvent(second));

    expect(logs).toEqual(['second sync']);

    secondDeferred.resolve();
    await Promise.resolve();
    expect(logs).toEqual(['second sync']);

    firstDeferred.resolve();
    await firstResult;
    await secondResult;

    expect(logs).toEqual(['second sync', 'first parent', 'second parent']);
  });

  test('broadcasts document and window events to matching handlers', () => {
    const { doc, win } = createLoaderEnvironment(['d:scroll', 'w:resize']);
    const logs: string[] = [];
    const documentEl = setDispatch(createMockElement(null, {}, undefined), 'd:scroll', () =>
      logs.push('document')
    );
    const windowEl = setDispatch(createMockElement(null, {}, undefined), 'w:resize', () =>
      logs.push('window')
    );
    doc.querySelectorAll = vi.fn((selector: string) => {
      if (selector === '[q-d\\:scroll]') {
        return [documentEl];
      }
      if (selector === '[q-w\\:resize]') {
        return [windowEl];
      }
      return [];
    });

    getSingleListener(doc, 'scroll').handler(createMockEvent(null, { type: 'scroll' }));
    getSingleListener(win, 'resize').handler(createMockEvent(null, { type: 'resize' }));

    expect(logs).toEqual(['document', 'window']);
  });

  test('invokes sync qrl handlers from qFuncs using captured ids', async () => {
    const { doc } = createLoaderEnvironment(['e:click']);
    const logs: string[] = [];
    const container = createMockContainer({
      'q:base': '/build/',
      'q:instance': 'test',
    });
    const child = createMockElement(null, {
      'q-e:click': '#0#capture',
    });
    child.closest = vi.fn(() => container);
    doc.qFuncs_test = [
      function (this: string | undefined, ev: any, el: any) {
        logs.push(`${this}:${ev.type}:${el === child}`);
      },
    ];

    await getSingleListener(doc, 'click').handler(createMockEvent(child));

    expect(logs).toEqual(['capture:click:true']);
  });
});
