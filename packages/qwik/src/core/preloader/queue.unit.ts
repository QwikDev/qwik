import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createDocument } from '@qwik.dev/core/testing';

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
      serialized.push(-100);
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
  const { initPreloader } = await import('./bundle-graph');
  const { preload } = await import('./queue');

  initPreloader(['entry-a.js', 'entry-b.js']);
  preload(['entry-a.js', 'entry-b.js'], 1);

  expect(headAppend).toHaveBeenCalledTimes(0);
  expect(document.head.querySelectorAll('link').length).toBe(0);

  vi.runAllTimers();

  expect(headAppend).toHaveBeenCalledTimes(2);
  expect(headAppend.mock.calls[0][0].nodeName).toBe('LINK');
  expect(document.head.querySelectorAll('link').length).toBe(2);
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
  const { initPreloader } = await import('./bundle-graph');
  const { preload } = await import('./queue');

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
  const { initPreloader } = await import('./bundle-graph');
  const { preload } = await import('./queue');

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
  const { initPreloader } = await import('./bundle-graph');
  const { preload } = await import('./queue');

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

test('a certain bundle keeps its dynamic imports at their edge probability', async () => {
  // Regression test: a certain (probability 1) bundle must not force-elevate its *dynamic*
  // imports to ~99%. Only static imports ($importProbability$ === 1) are certain to load with
  // their importer; dynamic imports keep propagating multiplicatively. Otherwise a component
  // that references a large map of lazy imports would preload every entry in the map.
  installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  vi.spyOn(performance, 'now').mockImplementation(() => 0);
  vi.resetModules();
  await installTestPlatform();

  const { initPreloader } = await import('./bundle-graph');
  const { preload, bundles } = await import('./queue');

  // entry-a.js dynamically imports dep-1.js with a 60% edge probability (the -60 marker).
  initPreloader(['entry-a.js', -60, 3, 'dep-1.js']);
  preload('entry-a.js', 1);
  vi.runAllTimers();

  // 60% probability => inverseProbability 0.4. Before the fix this was ~0.01 (99% "sure"),
  // because the dynamic import inherited its certain importer's probability.
  const dep = bundles.get('dep-1.js');
  expect(dep).toBeDefined();
  expect(dep!.$inverseProbability$).toBeCloseTo(0.4, 5);
});

test('a certain bundle still elevates its static imports to 100%', async () => {
  // Guard the other side of the branch: static imports (probability 1, the -100 marker used by
  // createLinearGraph) of a certain bundle stay certain (inverseProbability 0).
  installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  vi.spyOn(performance, 'now').mockImplementation(() => 0);
  vi.resetModules();
  await installTestPlatform();

  const { initPreloader } = await import('./bundle-graph');
  const { preload, bundles } = await import('./queue');

  // entry-a.js statically imports dep-1.js (100% edge probability, the -100 marker).
  initPreloader(['entry-a.js', -100, 3, 'dep-1.js']);
  preload('entry-a.js', 1);
  vi.runAllTimers();

  const dep = bundles.get('dep-1.js');
  expect(dep).toBeDefined();
  expect(dep!.$inverseProbability$).toBeCloseTo(0, 5);
});

test("preloads a certain bundle's dynamic imports (e.g. a lazy modal's chunk)", async () => {
  // The core behaviour the preloader exists to provide: when a bundle is certain to run, its
  // dynamic imports (a lazily-rendered modal, its handlers, etc.) are preloaded so the
  // follow-up interaction is instant instead of fetching a chunk on click. This guards against
  // regressing that into an under-preload where a certain bundle's dynamic dep is not queued.
  const document = installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  vi.spyOn(performance, 'now').mockImplementation(() => 0);
  vi.resetModules();
  await installTestPlatform();

  const headAppend = vi.spyOn(document.head, 'appendChild');
  const { initPreloader } = await import('./bundle-graph');
  const { preload } = await import('./queue');

  // entry-a.js is certain and dynamically imports modal.js with a 60% edge probability (-6).
  initPreloader(['entry-a.js', -60, 3, 'modal.js']);
  preload('entry-a.js', 1);
  vi.runAllTimers();

  const preloaded = headAppend.mock.calls.map((call) => (call[0] as HTMLLinkElement).href);
  // Both the certain bundle and its dynamic import get a preload link.
  expect(preloaded.some((href) => href.includes('entry-a.js'))).toBe(true);
  expect(preloaded.some((href) => href.includes('modal.js'))).toBe(true);
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
