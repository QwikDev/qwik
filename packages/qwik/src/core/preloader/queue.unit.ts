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
