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

test('batches preloads into a single head append per trigger', async () => {
  const document = installBrowserGlobals();
  vi.spyOn(Date, 'now').mockImplementation(() => 0);
  vi.resetModules();
  await installTestPlatform();

  const headAppend = vi.spyOn(document.head, 'appendChild');
  const { initPreloader } = await import('./bundle-graph');
  const { preload, resetQueue, getQueue } = await import('./queue');

  resetQueue();
  initPreloader(['entry-a.js', 'entry-b.js']);
  preload(['entry-a.js', 'entry-b.js'], 1);

  expect(headAppend).toHaveBeenCalledTimes(1);
  expect(headAppend.mock.calls[0][0].nodeType).toBe(11);
  expect(document.head.querySelectorAll('link').length).toBe(2);
  expect(getQueue()).toEqual([]);
});

test('yields after the frame budget and resumes later', async () => {
  const document = installBrowserGlobals();
  Object.assign(globalThis, {
    MessageChannel: undefined,
  });
  let now = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => {
    now += 10;
    return now;
  });
  vi.resetModules();
  await installTestPlatform();

  const headAppend = vi.spyOn(document.head, 'appendChild');
  const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
  const { initPreloader } = await import('./bundle-graph');
  const { preload, resetQueue, getQueue } = await import('./queue');

  resetQueue();
  initPreloader(['entry-a.js', 'entry-b.js', 'entry-c.js']);
  preload(['entry-a.js', 'entry-b.js', 'entry-c.js'], 1);

  expect(getQueue()).toEqual([10, 'entry-b.js', 'entry-a.js']);
  expect(document.head.querySelectorAll('link').length).toBe(1);
  expect(headAppend).toHaveBeenCalledTimes(1);
  expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function));

  vi.runOnlyPendingTimers();

  expect(getQueue()).toEqual([10, 'entry-a.js']);
  expect(document.head.querySelectorAll('link').length).toBe(2);
  expect(headAppend).toHaveBeenCalledTimes(2);
});
