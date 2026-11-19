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
  vi.unstubAllGlobals();
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

test('preloads equally likely hinted bundles in hint order', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { initPreloader, preload } = await importAndResetState();

  initPreloader(['a.js', 'b.js', 'c.js']);
  preload(['a.js', 'b.js', 'c.js'], 0.8);
  vi.runAllTimers();

  expect(linkNames(document)).toEqual(['a.js', 'b.js', 'c.js']);
});

test('holds speculative preloads while a highest priority bundle is loading', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  vi.spyOn(performance, 'now').mockImplementation(() => 0);
  vi.resetModules();
  await installTestPlatform();

  const { initPreloader, preload } = await importAndResetState();

  const speculative = Array.from({ length: 5 }, (_, index) => `spec-${index}.js`);
  initPreloader(['highest-priority.js', ...speculative]);
  preload(speculative, 0.8);
  preload('highest-priority.js', 1);
  vi.runAllTimers();

  const links = () => Array.from(document.head.querySelectorAll('link')) as HTMLLinkElement[];
  expect(links().map((link) => link.href.split('/').pop())).toEqual(['highest-priority.js']);

  links()[0].onload!(new Event('load'));
  vi.runAllTimers();

  expect(
    links()
      .map((link) => link.href.split('/').pop())
      .sort()
  ).toEqual(speculative);
});

test('holds speculative preloads once an in-flight preload becomes highest priority', async () => {
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

  initPreloader(['highest-priority.js', 'spec.js']);
  preload('highest-priority.js', 1);
  vi.runAllTimers();
  const highestPriority = document.head.querySelector('link') as HTMLLinkElement;
  highestPriority.onload!(new Event('load'));
  preload('spec.js', 0.8);
  vi.runAllTimers();
  const spec = document.head.querySelector('link') as HTMLLinkElement;

  expect(highestPriority.getAttribute('fetchpriority')).toBe(null);
  expect(spec.href.split('/').pop()).toBe('spec.js');
  expect(spec.getAttribute('fetchpriority')).toBe('low');
});

test('keeps a bundle at the highest priority when a later hint gives it a lower probability', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  vi.spyOn(performance, 'now').mockImplementation(() => 0);
  vi.resetModules();
  await installTestPlatform();

  const { initPreloader, preload } = await importAndResetState();

  initPreloader(['highest-priority.js']);
  preload('highest-priority.js', 1);
  preload('highest-priority.js', 0.6);
  vi.runAllTimers();

  const highestPriority = document.head.querySelector('link') as HTMLLinkElement;
  expect(highestPriority.getAttribute('fetchpriority')).toBe(null);
});

test('keeps a highest priority dependency at the highest priority when another importer is hinted at a lower probability', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  vi.spyOn(performance, 'now').mockImplementation(() => 0);
  vi.resetModules();
  await installTestPlatform();

  const { initPreloader, preload } = await importAndResetState();

  initPreloader(['highest-priority.js', -9, 6, 'other.js', -9, 6, 'shared.js']);
  preload('highest-priority.js', 1);
  preload('other.js', 0.6);
  vi.runAllTimers();

  const links = Array.from(document.head.querySelectorAll('link')) as HTMLLinkElement[];
  const shared = links.find((link) => link.href.endsWith('shared.js'))!;
  expect(shared.getAttribute('fetchpriority')).toBe(null);
});

test('preloads a bundle again once it is hinted at the highest priority, after its preload failed', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  vi.spyOn(performance, 'now').mockImplementation(() => 0);
  vi.resetModules();
  await installTestPlatform();

  const { initPreloader, preload } = await importAndResetState();

  initPreloader(['entry-a.js']);
  preload('entry-a.js', 0.8);
  vi.runAllTimers();
  const failed = document.head.querySelector('link') as HTMLLinkElement;
  failed.onerror!(new Event('error'));
  preload('entry-a.js', 1);
  vi.runAllTimers();

  const retried = document.head.querySelector('link') as HTMLLinkElement;
  expect(retried.href.split('/').pop()).toBe('entry-a.js');
  expect(retried.getAttribute('fetchpriority')).toBe(null);
});

const startPreloaderWith = async (graph: (string | number)[]) => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockImplementation(() => 0);
  vi.resetModules();
  await installTestPlatform();
  const { initPreloader, preload } = await importAndResetState();
  initPreloader(graph);
  return { document, preload };
};

const failPreload = (document: Document) =>
  (document.head.querySelector('link') as HTMLLinkElement).onerror!(new Event('error'));

const preloadLinks = (document: Document) =>
  Array.from(document.head.querySelectorAll('link'), (link) => ({
    name: link.href.split('/').pop(),
    priority: link.getAttribute('fetchpriority'),
  }));

test('retries a failed speculative preload once, after a delay', async () => {
  const { document, preload } = await startPreloaderWith(['entry-a.js']);
  preload('entry-a.js', 0.8);
  vi.runAllTimers();

  failPreload(document);
  vi.advanceTimersByTime(100);
  expect(preloadLinks(document)).toEqual([]);

  vi.runAllTimers();
  expect(preloadLinks(document)).toEqual([{ name: 'entry-a.js', priority: 'low' }]);
});

test('retries a failed highest priority preload at once', async () => {
  const { document, preload } = await startPreloaderWith(['entry-a.js']);
  preload('entry-a.js', 1);
  vi.runAllTimers();

  failPreload(document);
  vi.advanceTimersByTime(10);

  expect(preloadLinks(document)).toEqual([{ name: 'entry-a.js', priority: null }]);
});

test('stops after the retry fails too, even when the same hint comes again', async () => {
  const { document, preload } = await startPreloaderWith(['entry-a.js']);
  preload('entry-a.js', 0.8);
  vi.runAllTimers();
  failPreload(document);
  vi.runAllTimers();

  failPreload(document);
  vi.runAllTimers();
  expect(preloadLinks(document)).toEqual([]);

  preload('entry-a.js', 0.8);
  vi.runAllTimers();
  expect(preloadLinks(document)).toEqual([]);
});

test('does not retry a preload that failed while the browser is offline', async () => {
  const { document, preload } = await startPreloaderWith(['entry-a.js']);
  vi.stubGlobal('navigator', { onLine: false });
  preload('entry-a.js', 0.8);
  vi.runAllTimers();

  failPreload(document);
  vi.runAllTimers();

  expect(preloadLinks(document)).toEqual([]);
});

test('gives every failed preload two new attempts when the network comes back', async () => {
  const { document, preload } = await startPreloaderWith(['entry-a.js']);
  const listen = vi.fn();
  document.defaultView!.addEventListener = listen;
  vi.stubGlobal('navigator', { onLine: false });
  preload('entry-a.js', 0.8);
  vi.runAllTimers();
  failPreload(document);
  vi.runAllTimers();

  vi.stubGlobal('navigator', { onLine: true });
  const onNetworkBack = listen.mock.calls.find(([type]) => type === 'online')![1];
  onNetworkBack();
  vi.runAllTimers();
  expect(preloadLinks(document)).toEqual([{ name: 'entry-a.js', priority: 'low' }]);

  failPreload(document);
  vi.runAllTimers();
  expect(preloadLinks(document)).toEqual([{ name: 'entry-a.js', priority: 'low' }]);

  failPreload(document);
  vi.runAllTimers();
  expect(preloadLinks(document)).toEqual([]);
});

test('a hint at the highest priority still preloads a bundle whose two attempts failed', async () => {
  const { document, preload } = await startPreloaderWith(['entry-a.js']);
  preload('entry-a.js', 0.8);
  vi.runAllTimers();
  failPreload(document);
  vi.runAllTimers();
  failPreload(document);
  vi.runAllTimers();

  preload('entry-a.js', 1);
  vi.runAllTimers();

  expect(preloadLinks(document)).toEqual([{ name: 'entry-a.js', priority: null }]);
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

test('keeps newer highest priority hints when buffered replay resumes after yielding', async () => {
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

test('keeps highest priority links at the highest priority between buffered replay slices', async () => {
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
  preload('highest-priority.js', 0.8);
  adjust.port1.onmessage!();
  clock.mockImplementation(() => (now += 11));
  loadBundleGraph(
    '/build/',
    Promise.resolve({
      text: async () => JSON.stringify(['route/', 2, 'highest-priority.js', 4, 'leaf.js']),
    } as Response)
  );
  await flushPromises();
  const replay = channels[2];
  clock.mockImplementation(() => now);
  adjust.port1.onmessage!();
  expect(bundles.get('highest-priority.js')!.$inverseProbability$).toBe(0);

  replay.port1.onmessage!();
  expect(bundles.get('highest-priority.js')!.$inverseProbability$).toBe(0);
  trigger.port1.onmessage!();
  const highestPriorityLink = document.head.querySelector('link[href$="highest-priority.js"]');
  expect(highestPriorityLink).not.toBeNull();
  expect(highestPriorityLink!.getAttribute('fetchpriority')).not.toBe('low');

  adjust.port1.onmessage!();
  trigger.port1.onmessage!();
  const leafLink = document.head.querySelector('link[href$="leaf.js"]');
  expect(leafLink).not.toBeNull();
  expect(leafLink!.getAttribute('fetchpriority')).not.toBe('low');
  expect(bundles.get('highest-priority.js')!.$inverseProbability$).toBe(0);
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

test.each([true, false])(
  'propagates the highest priority to static descendants (buffered hints=%s)',
  async (buffered) => {
    const document = installBrowserGlobals();
    Object.assign(globalThis, { MessageChannel: undefined });
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.resetModules();
    await installTestPlatform();
    const { loadBundleGraph } = await import('./bundle-graph');
    const { preload, bundles } = await import('./queue');
    const loadGraph = () =>
      loadBundleGraph(
        '/build/',
        Promise.resolve({
          text: async () =>
            JSON.stringify(['a.js', -5, 3, 'b.js', -5, 6, 'c.js', 8, 'static-child.js']),
        } as Response)
      );

    if (!buffered) {
      loadGraph();
      await vi.runAllTimersAsync();
    }
    preload('c.js', 0.988);
    preload('b.js', 0.995);
    preload('a.js', 1);
    if (buffered) {
      vi.runAllTimers();
      loadGraph();
    }
    await vi.runAllTimersAsync();

    expect(bundles.get('c.js')!.$inverseProbability$).toBe(0.01);
    expect(bundles.get('static-child.js')!.$inverseProbability$).toBe(0);
    const childLink = document.head.querySelector('link[href$="/static-child.js"]');
    expect(childLink).not.toBeNull();
    expect(childLink!.getAttribute('fetchpriority')).not.toBe('low');
  }
);

test('a dependency takes the strongest hint that reached it', async () => {
  installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { loadBundleGraph } = await import('./bundle-graph');
  const { preload, bundles } = await import('./queue');
  preload('a.js', 0.6);
  preload('b.js', 0.8);
  vi.runAllTimers();
  loadBundleGraph(
    '/build/',
    Promise.resolve({
      text: async () => JSON.stringify(['a.js', -1, 6, 'b.js', -1, 6, 'c.js']),
    } as Response)
  );
  await vi.runAllTimersAsync();
  expect(bundles.get('c.js')!.$inverseProbability$).toBeCloseTo(0.2);

  preload('a.js', 0.9);
  await vi.runAllTimersAsync();

  expect(bundles.get('c.js')!.$inverseProbability$).toBeCloseTo(0.1);
});

test('schedules a single adjustment task for many replayed hints', async () => {
  installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { loadBundleGraph } = await import('./bundle-graph');
  const { preload } = await import('./queue');
  const hints = Array.from({ length: 50 }, (_, index) => `hint-${index}.js`);
  preload(hints, 0.8);
  vi.runAllTimers();

  loadBundleGraph(
    '/build/',
    Promise.resolve({ text: async () => JSON.stringify(hints) } as Response)
  );
  for (let tick = 0; tick < 10; tick++) {
    await Promise.resolve();
  }

  const adjustmentTaskAndTriggerTask = 2;
  expect(vi.getTimerCount()).toBe(adjustmentTaskAndTriggerTask);
});

const linkNames = (document: Document) =>
  Array.from(document.head.querySelectorAll('link'), (link) =>
    new URL(link.href).pathname.split('/').pop()
  );

test('holds speculative preloads until the bundle graph has loaded, but not highest priority ones', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { loadBundleGraph } = await import('./bundle-graph');
  const { preload } = await import('./queue');
  let deliverGraph!: (response: Response) => void;
  loadBundleGraph('/build/', new Promise<Response>((resolve) => (deliverGraph = resolve)));

  preload('speculative.js', 0.8);
  await vi.runAllTimersAsync();
  expect(linkNames(document)).toEqual([]);

  preload('highest-priority.js', 1);
  await vi.runAllTimersAsync();
  expect(linkNames(document)).toEqual(['highest-priority.js']);

  deliverGraph({
    text: async () => JSON.stringify(['speculative.js', 'highest-priority.js']),
  } as Response);
  document.head.querySelector('link')!.onload!({} as Event);
  await vi.runAllTimersAsync();
  expect(linkNames(document)).toEqual(['speculative.js']);
});

test('starts speculative preloads when the bundle graph fails to load', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.resetModules();
  await installTestPlatform();
  const { loadBundleGraph } = await import('./bundle-graph');
  const { preload } = await import('./queue');
  loadBundleGraph('/build/', Promise.reject(new Error('offline')));

  preload('speculative.js', 0.8);
  await vi.runAllTimersAsync();

  expect(linkNames(document)).toEqual(['speculative.js']);
});

test('still preloads a bundle first hinted after the bundle graph failed to load', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.resetModules();
  await installTestPlatform();
  const { loadBundleGraph } = await import('./bundle-graph');
  const { preload } = await import('./queue');
  loadBundleGraph('/build/', Promise.reject(new Error('offline')));
  await vi.runAllTimersAsync();

  preload('hinted-late.js', 1);
  await vi.runAllTimersAsync();

  expect(linkNames(document)).toEqual(['hinted-late.js']);
});

test('starts speculative preloads when no bundle graph is requested', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { loadBundleGraph } = await import('./bundle-graph');
  const { preload } = await import('./queue');
  loadBundleGraph('/build/');

  preload('speculative.js', 0.8);
  await vi.runAllTimersAsync();

  expect(linkNames(document)).toEqual(['speculative.js']);
});

test('keeps a dependency at the highest priority when its importer is replayed in a later slice', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  let now = 0;
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.resetModules();
  await installTestPlatform();
  const { loadBundleGraph } = await import('./bundle-graph');
  const { preload } = await import('./queue');
  let deliverGraph!: (response: Response) => void;
  loadBundleGraph('/build/', new Promise<Response>((resolve) => (deliverGraph = resolve)));
  preload('dependency.js', 0.8);
  preload(['filler-1.js', 'filler-2.js', 'filler-3.js'], 0.5);
  preload('importer.js', 1);
  await vi.runAllTimersAsync();
  document.head.querySelector('link')!.onload!({} as Event);
  await vi.runAllTimersAsync();
  expect(linkNames(document)).toEqual([]);

  clock.mockImplementation(() => (now += 6));
  deliverGraph({
    text: async () =>
      JSON.stringify([
        'dependency.js',
        'filler-1.js',
        'filler-2.js',
        'filler-3.js',
        'importer.js',
        0,
      ]),
  } as Response);
  await vi.runAllTimersAsync();

  const dependencyLink = document.head.querySelector('link[href$="/dependency.js"]')!;
  expect(dependencyLink.getAttribute('fetchpriority')).toBeNull();
});

test('sends a bundle hinted at the highest priority before the preloader started ahead of speculative ones once the graph arrives', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { loadBundleGraph } = await import('./bundle-graph');
  const { nextTriggerMacroTask, preload } = await import('./queue');

  preload('highest-priority.js', 1);
  await vi.runAllTimersAsync();
  let deliverGraph!: (response: Response) => void;
  loadBundleGraph('/build/', new Promise<Response>((resolve) => (deliverGraph = resolve)));
  preload('speculative.js', 0.6);
  await vi.runAllTimersAsync();
  expect(linkNames(document)).toEqual([]);

  nextTriggerMacroTask();
  deliverGraph({
    text: async () => JSON.stringify(['highest-priority.js', 'speculative.js']),
  } as Response);
  await vi.runAllTimersAsync();

  expect(linkNames(document)).toEqual(['highest-priority.js']);
});

test('a hint on a bundle whose dependencies lead back to it preloads each bundle once', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { initPreloader, preload } = await importAndResetState();

  initPreloader(['page-a.js', -7, 3, 'page-b.js', -7, 0]);
  preload('page-a.js', 1);
  vi.runAllTimers();

  expect(linkNames(document).sort()).toEqual(['page-a.js', 'page-b.js']);
});

const LAYOUT_AND_ROUTE_GRAPH = ['DocsLayout', -7, 3, 'layout.js', 'docs/intro/', -7, 7, 'page.js'];

test('a highest priority hint of several names preloads the bundles of each, never the names', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { initPreloader, preload } = await importAndResetState();

  initPreloader(LAYOUT_AND_ROUTE_GRAPH);
  preload(['DocsLayout', 'docs/intro/'], 1);
  vi.runAllTimers();

  expect(linkNames(document).sort()).toEqual(['layout.js', 'page.js']);
});

test('a layout key hinted before the bundle graph loaded is preloaded once it loads', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { loadBundleGraph } = await import('./bundle-graph');
  const { nextTriggerMacroTask, preload } = await import('./queue');

  preload(['DocsLayout', 'docs/intro/'], 1);
  await vi.runAllTimersAsync();
  let deliverGraph!: (response: Response) => void;
  loadBundleGraph('/build/', new Promise<Response>((resolve) => (deliverGraph = resolve)));
  await vi.runAllTimersAsync();
  expect(linkNames(document)).toEqual([]);

  nextTriggerMacroTask();
  deliverGraph({ text: async () => JSON.stringify(LAYOUT_AND_ROUTE_GRAPH) } as Response);
  await vi.runAllTimersAsync();

  expect(linkNames(document).sort()).toEqual(['layout.js', 'page.js']);
});

test('a limit of 0 starts no speculative preload, and still preloads at the highest priority', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { loadBundleGraph } = await import('./bundle-graph');
  const { preload } = await import('./queue');

  const graph = { text: async () => JSON.stringify(['speculative.js', 'highest-priority.js']) };
  loadBundleGraph('/build/', Promise.resolve(graph as Response), { P: 0 });
  await vi.runAllTimersAsync();
  preload('speculative.js', 0.8);
  await vi.runAllTimersAsync();
  expect(linkNames(document)).toEqual([]);

  preload('highest-priority.js', 1);
  await vi.runAllTimersAsync();
  expect(linkNames(document)).toEqual(['highest-priority.js']);
});

type ChunkKind = 'handler' | 'qrl' | 'component';
const KIND_MARKERS: Record<ChunkKind, number> = { handler: -2, qrl: -3, component: -4 };

const graphOf = (
  entries: Record<string, { kind?: ChunkKind; imports?: string[]; qrls?: string[] }>
) => {
  const positions = new Map<string, number>();
  let position = 0;
  for (const [name, { kind, imports = [], qrls = [] }] of Object.entries(entries)) {
    positions.set(name, position);
    position += 1 + (kind ? 1 : 0) + imports.length + (qrls.length ? 1 + qrls.length : 0);
  }
  const serialized: (string | number)[] = [];
  for (const [name, { kind, imports = [], qrls = [] }] of Object.entries(entries)) {
    serialized.push(name);
    if (kind) {
      serialized.push(KIND_MARKERS[kind]);
    }
    serialized.push(...imports.map((dep) => positions.get(dep)!));
    if (qrls.length) {
      serialized.push(-1, ...qrls.map((dep) => positions.get(dep)!));
    }
  }
  return serialized;
};

const CARD_PAGE = graphOf({
  'page/': { qrls: ['card-render.js', 'card-tasks.js', 'card-events.js'] },
  'card-render.js': { kind: 'component' },
  'card-tasks.js': { kind: 'qrl' },
  'card-events.js': { kind: 'handler', imports: ['card.js'] },
  'card.js': {},
});

const preloadWithGraph = async (serializedGraph: (string | number)[]) => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { initPreloader, preload } = await importAndResetState();
  initPreloader(serializedGraph);
  return { document, preload };
};

test('among the chunks one hint reaches, handlers go first, then other QRLs, then components', async () => {
  const { document, preload } = await preloadWithGraph(CARD_PAGE);

  preload('page/', 0.6);
  vi.runAllTimers();

  expect(linkNames(document).filter((name) => name !== 'card.js')).toEqual([
    'card-events.js',
    'card-tasks.js',
    'card-render.js',
  ]);
});

test("a chunk's static imports are preloaded with it", async () => {
  const { document, preload } = await preloadWithGraph(CARD_PAGE);

  preload('page/', 0.6);
  vi.runAllTimers();

  expect(linkNames(document).slice(0, 2)).toEqual(['card-events.js', 'card.js']);
});

test('a stronger hint goes first, whatever the kinds', async () => {
  const { document, preload } = await preloadWithGraph(CARD_PAGE);

  preload('card-events.js', 0.6);
  preload('card-render.js', 0.8);
  vi.runAllTimers();

  expect(linkNames(document)).toEqual(['card-render.js', 'card-events.js', 'card.js']);
});

test('a hint preloads every chunk it reaches, however many imports away', async () => {
  const chain = Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [
      `chunk-${index}.js`,
      index < 11 ? { qrls: [`chunk-${index + 1}.js`] } : {},
    ])
  );
  const { document, preload } = await preloadWithGraph(graphOf(chain));

  preload('chunk-0.js', 0.6);
  vi.runAllTimers();

  expect(linkNames(document)).toEqual(Object.keys(chain));
});

test('a hint for a page to render preloads components first', async () => {
  const { document, preload } = await preloadWithGraph(CARD_PAGE);

  preload('page/', 0.6, true);
  vi.runAllTimers();

  expect(linkNames(document).filter((name) => name !== 'card.js')).toEqual([
    'card-render.js',
    'card-tasks.js',
    'card-events.js',
  ]);
});

const preloadBeforeGraph = async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { loadBundleGraph } = await import('./bundle-graph');
  const { preload } = await import('./queue');
  let deliver!: (response: Response) => void;
  loadBundleGraph('/build/', new Promise<Response>((resolve) => (deliver = resolve)));
  const deliverGraph = async (serializedGraph: (string | number)[]) => {
    deliver({ text: async () => JSON.stringify(serializedGraph) } as Response);
    await vi.runAllTimersAsync();
  };
  return { document, preload, deliverGraph };
};

test('a chunk hinted before the bundle graph loaded still goes with the handler that imports it', async () => {
  const { document, preload, deliverGraph } = await preloadBeforeGraph();

  preload(['card-events.js', 'card-tasks.js', 'card-render.js'], 0.6);
  await vi.runAllTimersAsync();
  await deliverGraph(
    graphOf({
      'card-events.js': { kind: 'handler', imports: ['card-render.js'] },
      'card-tasks.js': { kind: 'qrl' },
      'card-render.js': { kind: 'component' },
    })
  );

  expect(linkNames(document)).toEqual(['card-events.js', 'card-render.js', 'card-tasks.js']);
});

test('before the bundle graph loaded, a stronger hint replaces an earlier hint for a page to render', async () => {
  const { document, preload, deliverGraph } = await preloadBeforeGraph();

  preload('card-render.js', 0.5, true);
  preload(['card-render.js', 'card-tasks.js'], 0.8);
  await vi.runAllTimersAsync();
  await deliverGraph(
    graphOf({
      'card-render.js': { kind: 'component' },
      'card-tasks.js': { kind: 'qrl' },
    })
  );

  expect(linkNames(document)).toEqual(['card-tasks.js', 'card-render.js']);
});

test('a weaker hint made before the bundle graph loaded does not reorder what a stronger one reaches', async () => {
  const { document, preload, deliverGraph } = await preloadBeforeGraph();

  preload('card-events.js', 0.8);
  preload('card-render.js', 0.5, true);
  await vi.runAllTimersAsync();
  await deliverGraph(
    graphOf({
      'card-events.js': { kind: 'handler', qrls: ['card-render.js', 'card-tasks.js'] },
      'card-render.js': { kind: 'component' },
      'card-tasks.js': { kind: 'qrl' },
    })
  );

  expect(linkNames(document)).toEqual(['card-events.js', 'card-tasks.js', 'card-render.js']);
});
