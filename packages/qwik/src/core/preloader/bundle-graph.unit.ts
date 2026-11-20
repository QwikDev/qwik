import { createDocument } from '@qwik.dev/core/testing';
import { afterEach, describe, expect, test, vi } from 'vitest';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

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

const importBundleGraph = async () => {
  const document = createDocument();
  Object.assign(globalThis, { window: { document }, document });
  vi.resetModules();
  const { setPlatform } = await import('../shared/platform/platform');
  const { getTestPlatform } = await import('../../testing/platform');
  setPlatform(getTestPlatform() as any);
  return import('./bundle-graph');
};

afterEach(() => {
  vi.resetModules();
  Object.assign(globalThis, { window: originalWindow, document: originalDocument });
});

describe('300k-entry bundle graph', () => {
  test.fails(
    'loading it never blocks the event loop for 30 ms',
    async () => {
      const { loadBundleGraph } = await importBundleGraph();
      const graph = JSON.stringify(createLinearGraph(300_000));
      let longestBlockMs = 0;
      let lastTick = performance.now();
      const ticker = setInterval(() => {
        const now = performance.now();
        longestBlockMs = Math.max(longestBlockMs, now - lastTick);
        lastTick = now;
      }, 1);

      loadBundleGraph('', Promise.resolve({ text: () => Promise.resolve(graph) } as Response));
      await new Promise((resolve) => setTimeout(resolve, 1000));

      clearInterval(ticker);
      expect(longestBlockMs).toBeLessThan(30);
    },
    30_000
  );
});
