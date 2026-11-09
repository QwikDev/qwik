import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createDocument } from '@qwik.dev/core/testing';

const importAndResetState = async () => {
  const { initPreloader } = await import('./bundle-graph');
  const { preload } = await import('./queue');
  return { initPreloader, preload };
};

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalHTMLElement = globalThis.HTMLElement;
const originalMessageChannel = globalThis.MessageChannel;

const installBrowserGlobals = () => {
  const document = createDocument();
  const HTMLElement = function HTMLElement() {};
  HTMLElement.toString = () => 'function HTMLElement() { [native code] }';

  Object.assign(globalThis, {
    window: { document },
    document,
    HTMLElement,
  });

  return document;
};

const installTestMessageChannels = () => {
  const channels: TestMessageChannel[] = [];
  class TestMessageChannel {
    port1 = { onmessage: null as null | (() => void), close: vi.fn() };
    port2 = { postMessage: vi.fn(), close: vi.fn() };
    constructor() {
      channels.push(this);
    }
  }
  Object.assign(globalThis, { MessageChannel: TestMessageChannel });
  return channels;
};

const installTestPlatform = async () => {
  const { setPlatform } = await import('../shared/platform/platform');
  const { getTestPlatform } = await import('../../testing/platform');
  setPlatform(getTestPlatform() as any);
};

const flushPromises = () =>
  Promise.resolve()
    .then(() => Promise.resolve())
    .then(() => Promise.resolve())
    .then(() => Promise.resolve());

const createLinearGraph = (length: number) => {
  const serialized: (string | number)[] = [];
  for (let i = 0; i < length; i++) {
    const nameIndex = serialized.length;
    serialized.push(i === 0 ? 'entry-a.js' : `dep-${i}.js`);
    if (i < length - 1) {
      serialized.push(-10);
      serialized.push(nameIndex + 3);
    }
  }
  return serialized;
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();

  Object.assign(globalThis, {
    window: originalWindow,
    document: originalDocument,
    HTMLElement: originalHTMLElement,
    MessageChannel: originalMessageChannel,
  });
});

test('appends preloads directly to head within a trigger slice', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  vi.spyOn(performance, 'now').mockImplementation(() => 0);
  vi.resetModules();
  await installTestPlatform();

  const headAppend = vi.spyOn(document.head, 'appendChild');
  const { initPreloader, preload } = await importAndResetState();

  initPreloader(['entry-a.js', 'entry-b.js']);
  preload(['entry-a.js', 'entry-b.js'], 1);

  expect(headAppend).toHaveBeenCalledTimes(0);
  expect(document.head.querySelectorAll('link').length).toBe(0);

  vi.runAllTimers();

  expect(headAppend).toHaveBeenCalledTimes(2);
  expect(headAppend.mock.calls[0][0].nodeName).toBe('LINK');
  expect(document.head.querySelectorAll('link').length).toBe(2);
});

test('limits concurrent speculative preloads to maxIdlePreloads', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  vi.spyOn(performance, 'now').mockImplementation(() => 0);
  vi.resetModules();
  await installTestPlatform();

  const { initPreloader } = await import('./bundle-graph');
  const { preload } = await import('./queue');

  const bundles = Array.from({ length: 30 }, (_, index) => `entry-${index}.js`);
  initPreloader(bundles);
  preload(bundles, 0.8);
  vi.runAllTimers();

  // Links never load in the test document, so the limit stays saturated.
  expect(document.head.querySelectorAll('link').length).toBe(25);
});

test('holds speculative preloads while a needed bundle is loading', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  vi.spyOn(performance, 'now').mockImplementation(() => 0);
  vi.resetModules();
  await installTestPlatform();

  const { initPreloader, preload } = await importAndResetState();

  const speculative = Array.from({ length: 5 }, (_, index) => `spec-${index}.js`);
  initPreloader(['needed.js', ...speculative]);
  preload(speculative, 0.8);
  preload('needed.js', 1);
  vi.runAllTimers();

  const links = () => Array.from(document.head.querySelectorAll('link')) as HTMLLinkElement[];
  expect(links().map((link) => link.href.split('/').pop())).toEqual(['needed.js']);

  links()[0].onload!(new Event('load'));
  vi.runAllTimers();

  expect(
    links()
      .map((link) => link.href.split('/').pop())
      .sort()
  ).toEqual(speculative);
});

test('holds speculative preloads once an in-flight preload becomes needed', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  vi.spyOn(performance, 'now').mockImplementation(() => 0);
  vi.resetModules();
  await installTestPlatform();

  const { initPreloader, preload } = await importAndResetState();

  const bundles = Array.from({ length: 30 }, (_, index) => `spec-${index}.js`);
  initPreloader(bundles);
  preload(bundles, 0.8);
  vi.runAllTimers();
  const links = () => Array.from(document.head.querySelectorAll('link')) as HTMLLinkElement[];
  expect(links().length).toBe(25);

  preload(links()[0].href.split('/').pop()!, 1);
  vi.runAllTimers();
  links()[1].onload!(new Event('load'));
  vi.runAllTimers();

  expect(links().length).toBe(24);
});

test('asks the browser for low priority on speculative preloads only', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  vi.spyOn(performance, 'now').mockImplementation(() => 0);
  vi.resetModules();
  await installTestPlatform();

  const { initPreloader, preload } = await importAndResetState();

  initPreloader(['needed.js', 'spec.js']);
  preload('needed.js', 1);
  vi.runAllTimers();
  const needed = document.head.querySelector('link') as HTMLLinkElement;
  needed.onload!(new Event('load'));
  preload('spec.js', 0.8);
  vi.runAllTimers();
  const spec = document.head.querySelector('link') as HTMLLinkElement;

  expect(needed.getAttribute('fetchpriority')).toBe(null);
  expect(spec.href.split('/').pop()).toBe('spec.js');
  expect(spec.getAttribute('fetchpriority')).toBe('low');
});

test('applies hints buffered before the preloader chunk loaded', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  vi.spyOn(performance, 'now').mockImplementation(() => 0);
  vi.resetModules();
  await installTestPlatform();

  // Buffered by core's copy of the bridge, e.g. the clicked handler's chunk
  const g = globalThis as { qPreload?: unknown; qPreloadQueue?: unknown[] };
  delete g.qPreload;
  g.qPreloadQueue = [['entry-a.js', 1]];
  // The chunk entry: evaluates bundle-graph and queue in the bundled order
  await import('./index');
  const { initPreloader } = await import('./bundle-graph');
  initPreloader(['entry-a.js']);
  await flushPromises();
  vi.runAllTimers();

  const names = Array.from(document.head.querySelectorAll('link')).map((link) =>
    (link as HTMLLinkElement).href.split('/').pop()
  );
  expect(names).toEqual(['entry-a.js']);
  delete g.qPreloadQueue;
});

test('yields after the frame budget and resumes later', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => {
    now += 10;
    return now;
  });
  vi.resetModules();
  await installTestPlatform();

  const headAppend = vi.spyOn(document.head, 'appendChild');
  const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
  const { initPreloader, preload } = await importAndResetState();

  initPreloader(['entry-a.js', 'entry-b.js', 'entry-c.js']);
  preload(['entry-a.js', 'entry-b.js', 'entry-c.js'], 1);

  expect(document.head.querySelectorAll('link').length).toBe(0);
  expect(headAppend).toHaveBeenCalledTimes(0);

  vi.advanceTimersToNextTimer();

  expect(document.head.querySelectorAll('link').length).toBe(0);
  expect(headAppend).toHaveBeenCalledTimes(0);

  vi.advanceTimersToNextTimer();

  expect(document.head.querySelectorAll('link').length).toBe(1);
  expect(headAppend).toHaveBeenCalledTimes(1);
  expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function));

  vi.advanceTimersToNextTimer();

  expect(document.head.querySelectorAll('link').length).toBe(2);
  expect(headAppend).toHaveBeenCalledTimes(2);

  vi.advanceTimersToNextTimer();

  expect(document.head.querySelectorAll('link').length).toBe(3);
  expect(headAppend).toHaveBeenCalledTimes(3);
});

test('yields during dependency propagation and resumes later', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  const nowValues = [0, 5, 20, 20, 21, 22, 30, 35, 40, 41, 42];
  let lastNow = nowValues[nowValues.length - 1];
  vi.spyOn(performance, 'now').mockImplementation(() => {
    const next = nowValues.shift();
    if (typeof next === 'number') {
      lastNow = next;
      return next;
    }
    lastNow++;
    return lastNow;
  });
  vi.resetModules();
  await installTestPlatform();

  const headAppend = vi.spyOn(document.head, 'appendChild');
  const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
  const { initPreloader, preload } = await importAndResetState();

  initPreloader(createLinearGraph(4));
  preload('entry-a.js', 1);

  expect(timeoutSpy).toHaveBeenCalledTimes(1);
  expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function));
  expect(document.head.querySelectorAll('link').length).toBe(0);
  expect(headAppend).toHaveBeenCalledTimes(0);

  vi.advanceTimersToNextTimer();

  expect(document.head.querySelectorAll('link').length).toBe(0);
  expect(headAppend).toHaveBeenCalledTimes(0);

  vi.runAllTimers();

  expect(document.head.querySelectorAll('link').length).toBe(4);
  expect(headAppend.mock.calls.length).toBeGreaterThanOrEqual(1);
});

test('can yield more than once while propagating dependencies', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => {
    const stack = new Error().stack ?? '';
    if (stack.includes('processPendingAdjustments')) {
      now += 20;
      return now;
    }
    return 0;
  });
  vi.resetModules();
  await installTestPlatform();

  const headAppend = vi.spyOn(document.head, 'appendChild');
  const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
  const { initPreloader, preload } = await importAndResetState();

  initPreloader(createLinearGraph(7));
  preload('entry-a.js', 1);

  expect(timeoutSpy).toHaveBeenCalledTimes(1);
  expect(document.head.querySelectorAll('link').length).toBe(0);

  vi.advanceTimersToNextTimer();

  expect(timeoutSpy.mock.calls.length).toBeGreaterThan(2);
  expect(document.head.querySelectorAll('link').length).toBeLessThan(7);

  vi.runAllTimers();

  expect(document.head.querySelectorAll('link').length).toBe(7);
  expect(headAppend.mock.calls.length).toBeGreaterThan(1);
});

test('defers bundle graph re-adjustment to a later task', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  vi.spyOn(performance, 'now').mockImplementation(() => 0);
  vi.resetModules();
  await installTestPlatform();

  const headAppend = vi.spyOn(document.head, 'appendChild');
  const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
  const { loadBundleGraph } = await import('./bundle-graph');
  const { preload } = await import('./queue');

  preload('entry-a.js', 1);
  loadBundleGraph(
    '',
    Promise.resolve({
      text: () => Promise.resolve(JSON.stringify(createLinearGraph(4))),
    } as Response)
  );

  await flushPromises();

  expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function));
  expect(headAppend).not.toHaveBeenCalled();

  vi.runOnlyPendingTimers();

  expect(headAppend).toHaveBeenCalled();
});

test('replays buffered hints without allocating unrelated BundleImport records', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { loadBundleGraph } = await import('./bundle-graph');
  const { preload, bundles } = await import('./queue');
  preload('route/', 1);
  loadBundleGraph(
    '/build/',
    Promise.resolve({
      text: async () =>
        JSON.stringify(['route/', 2, 'route.js', 4, 'helper.js', 'unrelated.js', 'other/']),
    } as Response)
  );
  await vi.runAllTimersAsync();
  expect([...bundles.keys()]).toEqual(['route/', 'route.js', 'helper.js']);
  expect(
    Array.from(document.head.querySelectorAll('link'), (link) => new URL(link.href).pathname)
  ).toEqual(['/build/route.js', '/build/helper.js']);
});

test('yields while replaying many hints buffered before the graph arrives', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  let now = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.resetModules();
  await installTestPlatform();
  const { loadBundleGraph } = await import('./bundle-graph');
  const { preload, bundles } = await import('./queue');
  const hints = Array.from({ length: 100 }, (_, index) => `route-${index}/`);
  const serialized: (string | number)[] = [];
  for (let i = 0; i < hints.length; i++) {
    serialized.push(hints[i], serialized.length + 2, `entry-${i}.js`);
  }
  serialized.push('unused.js');

  preload(hints, 1);
  vi.runAllTimers();
  expect(bundles.size).toBe(hints.length);
  expect(document.head.querySelectorAll('link')).toHaveLength(0);

  clock.mockImplementation(() => (now += 6));
  loadBundleGraph(
    '/build/',
    Promise.resolve({ text: async () => JSON.stringify(serialized) } as Response)
  );
  await flushPromises();

  const replayed = hints.filter((name) => bundles.get(name)!.$deps$);
  expect(replayed.length).toBeGreaterThan(0);
  expect(replayed.length).toBeLessThan(hints.length);
  expect(document.head.querySelectorAll('link')).toHaveLength(0);

  await vi.runAllTimersAsync();

  expect(
    Array.from(document.head.querySelectorAll('link'), (link) => new URL(link.href).pathname).sort()
  ).toEqual(hints.map((_, index) => `/build/entry-${index}.js`).sort());
  expect(bundles.size).toBe(hints.length * 2);
  expect(bundles.has('unused.js')).toBe(false);
});

test('keeps newer required hints when buffered replay resumes after yielding', async () => {
  installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  let now = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.resetModules();
  await installTestPlatform();
  const { loadBundleGraph } = await import('./bundle-graph');
  const { preload, bundles } = await import('./queue');
  const chain = createLinearGraph(50);
  const serialized = [
    'first/',
    6,
    'second/',
    6,
    'third/',
    6 + chain.length,
    ...chain.map((entry) => (typeof entry === 'number' && entry >= 0 ? entry + 6 : entry)),
    'last.js',
  ];

  preload(['first/', 'second/'], 1);
  preload('third/', 0.8);
  vi.runAllTimers();
  clock.mockImplementation(() => (now += 6));
  loadBundleGraph(
    '/build/',
    Promise.resolve({ text: async () => JSON.stringify(serialized) } as Response)
  );
  await flushPromises();
  expect(bundles.get('third/')!.$deps$).toBeUndefined();

  preload('third/', 1);
  await vi.runAllTimersAsync();

  expect(bundles.get('third/')!.$inverseProbability$).toBe(0);
  expect(bundles.get('last.js')!.$inverseProbability$).toBe(0);
});

test('keeps required links at needed priority between buffered replay slices', async () => {
  const document = installBrowserGlobals();
  const channels = installTestMessageChannels();
  let now = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.resetModules();
  await installTestPlatform();
  const { loadBundleGraph } = await import('./bundle-graph');
  const { preload, bundles } = await import('./queue');
  const [trigger, adjust] = channels;

  preload('route/', 1);
  preload('needed.js', 0.8);
  adjust.port1.onmessage!();
  clock.mockImplementation(() => (now += 11));
  loadBundleGraph(
    '/build/',
    Promise.resolve({
      text: async () => JSON.stringify(['route/', 2, 'needed.js', 4, 'leaf.js']),
    } as Response)
  );
  await flushPromises();
  const replay = channels[2];
  clock.mockImplementation(() => now);
  adjust.port1.onmessage!();
  expect(bundles.get('needed.js')!.$inverseProbability$).toBe(0);

  replay.port1.onmessage!();
  expect(bundles.get('needed.js')!.$inverseProbability$).toBe(0);
  trigger.port1.onmessage!();
  const neededLink = document.head.querySelector('link[href$="needed.js"]');
  expect(neededLink).not.toBeNull();
  expect(neededLink!.getAttribute('fetchpriority')).not.toBe('low');

  adjust.port1.onmessage!();
  trigger.port1.onmessage!();
  const leafLink = document.head.querySelector('link[href$="leaf.js"]');
  expect(leafLink).not.toBeNull();
  expect(leafLink!.getAttribute('fetchpriority')).not.toBe('low');
  expect(bundles.get('needed.js')!.$inverseProbability$).toBe(0);
});

test('closes the replay MessageChannel after its final slice', async () => {
  installBrowserGlobals();
  const channels = installTestMessageChannels();
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => (now += 11));
  vi.resetModules();
  await installTestPlatform();
  const { loadBundleGraph } = await import('./bundle-graph');
  const { preload } = await import('./queue');

  preload(['first/', 'second/'], 1);
  loadBundleGraph(
    '/build/',
    Promise.resolve({ text: async () => JSON.stringify(['first/', 'second/']) } as Response)
  );
  await flushPromises();

  const replay = channels[2];
  expect(replay.port2.postMessage).toHaveBeenCalledTimes(1);
  expect(replay.port1.close).not.toHaveBeenCalled();
  expect(replay.port2.close).not.toHaveBeenCalled();

  replay.port1.onmessage!();

  expect(replay.port1.onmessage).toBeNull();
  expect(replay.port1.close).toHaveBeenCalledTimes(1);
  expect(replay.port2.close).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 2; i++) {
    expect(channels[i].port1.close).not.toHaveBeenCalled();
    expect(channels[i].port2.close).not.toHaveBeenCalled();
  }
});
