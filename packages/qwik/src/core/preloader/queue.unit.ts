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

test('preloads dependencies when a client QRL emits usage without an href', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();

  const listen = vi.spyOn(document, 'addEventListener');
  const { initPreloader } = await importAndResetState();
  initPreloader(['renderHash', 2, 'component.js', 4, 'dependency.js']);
  const listener = listen.mock.calls.find(([type]) => type === 'qsymbol')![1] as EventListener;
  listener({ detail: { symbol: 's_renderHash' } } as unknown as Event);
  vi.runAllTimers();

  expect(Array.from(document.head.querySelectorAll('link'), (link) => link.href)).toEqual([
    expect.stringContaining('component.js'),
    expect.stringContaining('dependency.js'),
  ]);
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

test('keeps dynamic dependencies speculative when their importer is needed', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();

  const { initPreloader, getBundle } = await import('./bundle-graph');
  const { preload } = await import('./queue');
  const { config } = await import('./constants');
  config.$maxIdlePreloads$ = 2;
  initPreloader([
    'entry.js',
    -10,
    5,
    -9,
    6,
    'static.js',
    'dynamic.js',
    -10,
    9,
    'dynamic-static.js',
  ]);
  preload('entry.js', 1);
  vi.runAllTimers();

  expect(getBundle('static.js')!.$inverseProbability$).toBe(0);
  expect(getBundle('dynamic.js')!.$inverseProbability$).toBeCloseTo(0.1);
  expect(getBundle('dynamic-static.js')!.$inverseProbability$).toBeCloseTo(0.1);
  const links = Array.from(document.head.querySelectorAll('link'));
  expect(links.map((link) => new URL(link.href).pathname.split('/').pop())).toEqual([
    'entry.js',
    'static.js',
  ]);

  for (const link of links) {
    link.onload!({} as Event);
  }
  vi.runAllTimers();
  const speculative = Array.from(document.head.querySelectorAll('link'));
  expect(speculative).toHaveLength(2);
  expect(speculative.map((link) => new URL(link.href).pathname.split('/').pop())).toEqual([
    'dynamic.js',
    'dynamic-static.js',
  ]);

  preload('dynamic.js', 1);
  vi.runAllTimers();
  expect(getBundle('dynamic.js')!.$inverseProbability$).toBe(0);
  expect(getBundle('dynamic-static.js')!.$inverseProbability$).toBe(0);
});

test('preloads upcoming components while required modules are still loading', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();

  const { initPreloader, preload } = await importAndResetState();
  const { config } = await import('./constants');
  config.$maxIdlePreloads$ = 2;
  initPreloader(['route.js', -9, 3, 'component.js', -8, 6, 'nested.js']);
  preload('route.js', 1);
  vi.runAllTimers();

  const links = Array.from(document.head.querySelectorAll('link'));
  expect(links.map((link) => link.href)).toEqual([
    expect.stringContaining('route.js'),
    expect.stringContaining('component.js'),
  ]);
  expect(links[1].getAttribute('fetchpriority')).toBe('low');
  links[1].onload!({} as Event);
  vi.runAllTimers();
  expect(document.head.querySelector('link[href$="nested.js"]')).not.toBeNull();
});

test('queues transitive render dependencies before their parents finish', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { initPreloader, preload } = await importAndResetState();
  const { getBundle } = await import('./bundle-graph');
  const { BundleImportState_Queued } = await import('./types');
  const { config } = await import('./constants');
  const { nextTriggerMacroTask } = await import('./queue');
  config.$maxIdlePreloads$ = 1;
  initPreloader([
    'route/',
    2,
    'route.js',
    -9,
    5,
    'component.js',
    -9,
    8,
    'child.js',
    10,
    'helper.js',
    'click.js',
  ]);
  preload('route/', 1);
  vi.runAllTimers();
  expect(getBundle('component.js')!.$state$).toBe(BundleImportState_Queued);
  expect(getBundle('child.js')!.$state$).toBe(BundleImportState_Queued);
  config.$maxIdlePreloads$ = 4;
  nextTriggerMacroTask();
  vi.runAllTimers();
  expect(
    Array.from(document.head.querySelectorAll('link'), (link) => new URL(link.href).pathname)
  ).toEqual(['/route.js', '/component.js', '/child.js', '/helper.js']);
});

test('starts bounded render work even when background preloads occupy every slot', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { initPreloader, preload } = await importAndResetState();
  const { config } = await import('./constants');
  config.$maxIdlePreloads$ = 2;
  initPreloader([
    'route/',
    2,
    'route.js',
    -19,
    5,
    'component.js',
    -19,
    8,
    'child.js',
    10,
    'helper.js',
    'old-a.js',
    'old-b.js',
    'click.js',
  ]);
  preload(['old-a.js', 'old-b.js'], 0.8);
  vi.runAllTimers();
  preload('route/', 1);
  vi.runAllTimers();

  const names = () =>
    Array.from(document.head.querySelectorAll('link'), (link) =>
      new URL(link.href).pathname.split('/').pop()
    );
  expect(names().slice(0, 2).sort()).toEqual(['old-a.js', 'old-b.js']);
  expect(names().slice(2)).toEqual(['route.js', 'component.js', 'child.js', 'helper.js']);
  expect(
    document.head.querySelector('link[href$="child.js"]')!.getAttribute('fetchpriority')
  ).toBeNull();
  expect(
    document.head.querySelector('link[href$="helper.js"]')!.getAttribute('fetchpriority')
  ).toBeNull();
  expect(names()).not.toContain('click.js');
});

test('does not postpone deeper render dependencies behind higher probability siblings', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { initPreloader, preload } = await importAndResetState();
  const { config } = await import('./constants');
  config.$maxIdlePreloads$ = 2;
  initPreloader(['route.js', -19, 5, -18, 8, 'component.js', -18, 9, 'sibling.js', 'child.js']);
  preload('route.js', 1);
  vi.runAllTimers();
  expect(
    Array.from(document.head.querySelectorAll('link'), (link) => new URL(link.href).pathname)
  ).toEqual(['/route.js', '/component.js', '/child.js']);
});

test('preloads render hooks before descending through static component wrappers', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { initPreloader, preload } = await importAndResetState();
  const { config } = await import('./constants');
  config.$maxIdlePreloads$ = 2;
  initPreloader([
    'route.js',
    -19,
    3,
    'component.js',
    7,
    -19,
    11,
    'wrapper.js',
    -19,
    10,
    'nested.js',
    'computed.js',
  ]);
  preload('route.js', 1);
  vi.runAllTimers();
  expect(
    Array.from(document.head.querySelectorAll('link'), (link) => new URL(link.href).pathname)
  ).toEqual(['/route.js', '/component.js', '/computed.js', '/wrapper.js']);
  expect(document.head.querySelector('link[href$="nested.js"]')).toBeFalsy();
});

test('keeps route alias descendants speculative until explicitly needed', async () => {
  installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();

  const { initPreloader, getBundle } = await import('./bundle-graph');
  const { preload } = await import('./queue');
  initPreloader(['product/[id]/', -5, 3, 'route.js', -8, 6, 'component.js']);
  preload('product/[id]/', 1);
  vi.runAllTimers();

  expect(getBundle('route.js')!.$inverseProbability$).toBeCloseTo(0.5);
  expect(getBundle('component.js')!.$inverseProbability$).toBeCloseTo(0.6);
});

test.each([1, 0.99])(
  'promotes active preloads at probability %s and ignores weaker hints',
  async (probability) => {
    const document = installBrowserGlobals();
    Object.assign(globalThis, { MessageChannel: undefined });
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.resetModules();
    await installTestPlatform();

    const { initPreloader } = await import('./bundle-graph');
    const { preload } = await import('./queue');
    const { config } = await import('./constants');
    config.$maxIdlePreloads$ = 1;
    initPreloader(['active.js', 'queued.js']);
    preload('active.js', 0.985);
    vi.runAllTimers();
    const active = document.head.querySelector('link')!;
    expect(active.getAttribute('fetchpriority')).toBe('low');

    preload('active.js', probability);
    preload('active.js', 0.8);
    preload('queued.js', 0.8);
    vi.runAllTimers();
    expect(active.getAttribute('fetchpriority')).toBeNull();
    expect(document.head.querySelectorAll('link')).toHaveLength(1);

    active.onload!({} as Event);
    vi.runAllTimers();
    expect(document.head.querySelector('link')!.href).toContain('queued.js');
  }
);

test('prioritizes dependencies of current demand over older speculative work', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();

  const { initPreloader, getBundle } = await import('./bundle-graph');
  const { preload } = await import('./queue');
  const { config } = await import('./constants');
  config.$maxIdlePreloads$ = 1;
  initPreloader(['blocking.js', 'old.js', 'product/', -5, 5, 'destination.js']);
  preload('blocking.js', 1);
  preload('old.js', 0.9);
  preload('product/', 0.8);

  for (let i = 0; i < 3; i++) {
    preload('product/', 1);
    vi.runAllTimers();
    expect(getBundle('destination.js')!.$inverseProbability$).toBeCloseTo(0.5);
  }
  const blocking = document.head.querySelector('link')!;
  expect(blocking.href).toContain('blocking.js');
  blocking.onload!({} as Event);
  vi.runAllTimers();
  expect(document.head.querySelector('link')!.href).toContain('destination.js');
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

test('preserves the order of navigation roots in a single hint', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { initPreloader, preload } = await importAndResetState();
  initPreloader(['handler.js', 'navigate.js', 'route.js']);
  preload(['handler.js', 'navigate.js', 'route.js'], 1);
  vi.runAllTimers();
  expect(
    Array.from(document.head.querySelectorAll('link'), (link) => new URL(link.href).pathname)
  ).toEqual(['/handler.js', '/navigate.js', '/route.js']);
});

test('fetches the static closure of a selected render without consuming another render slot', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { initPreloader, preload } = await importAndResetState();
  const { config } = await import('./constants');
  config.$maxIdlePreloads$ = 1;
  initPreloader(['route.js', -19, 3, 'component.js', 7, -19, 8, 'static.js', 'nested.js']);
  preload('route.js', 1);
  vi.runAllTimers();
  expect(
    Array.from(document.head.querySelectorAll('link'), (link) => new URL(link.href).pathname)
  ).toEqual(['/route.js', '/component.js', '/static.js']);
});

test('keeps selected render slots occupied through static import cycles', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, { MessageChannel: undefined });
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.resetModules();
  await installTestPlatform();
  const { initPreloader, preload } = await importAndResetState();
  const { config } = await import('./constants');
  config.$maxIdlePreloads$ = 1;
  initPreloader(['route.js', -19, 4, 8, 'first.js', 6, 'static.js', 4, 'second.js']);
  preload('route.js', 1);
  vi.runAllTimers();
  expect(document.head.querySelector('link[href$="static.js"]')).toBeTruthy();
  expect(document.head.querySelector('link[href$="second.js"]')).toBeFalsy();
  document.head.querySelector<HTMLLinkElement>('link[href$="first.js"]')!.onload!({} as Event);
  vi.runAllTimers();
  expect(document.head.querySelector('link[href$="second.js"]')).toBeTruthy();
});
