import { runInThisContext } from 'node:vm';
import { afterEach, expect, test } from 'vitest';
import { QWIK_DEVTOOLS_GLOBAL } from '@qwik.dev/devtools/kit';
import perfLazyWrapperPreamble from './perfLazyWrapperPreamble';

type Wrap = <T extends (...args: any[]) => any>(fn: T, name: string, viteId: string) => T;
type PerfEntry = { duration: number; renderCount: number };

const store = process as unknown as Record<string, unknown>;
afterEach(() => {
  for (const key of Object.values(QWIK_DEVTOOLS_GLOBAL.ssr)) {
    delete store[key];
  }
});

const wrap = runInThisContext(
  `(() => {\n${perfLazyWrapperPreamble}\nreturn __qwik_wrap__;\n})()`
) as Wrap;
const wrapRender = <T extends (...args: any[]) => any>(fn: T) =>
  wrap(fn, 'App_component_abc', '/src/app.tsx_App_component');

const recorded = () => store[QWIK_DEVTOOLS_GLOBAL.ssr.perfStore] as PerfEntry[] | undefined;

const busyWait = (ms: number) => {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // simulate render work
  }
};

test('async renders are timed until their promise settles', async () => {
  const render = wrapRender(async () => {
    await Promise.resolve();
    busyWait(30);
    return 'done';
  });

  await expect(render()).resolves.toBe('done');

  expect(recorded()).toEqual([expect.objectContaining({ renderCount: 1 })]);
  expect(recorded()![0].duration).toBeGreaterThanOrEqual(25);
});

test('render counts follow completed renders, in the order they finish', async () => {
  const release: (() => void)[] = [];
  const render = wrapRender(() => new Promise<void>((resolve) => release.push(resolve)));
  const first = render();
  const second = render();

  release[1]();
  await second;
  expect(recorded()![0].renderCount).toBe(1);
  release[0]();
  await first;
  expect(recorded()![0].renderCount).toBe(2);
});

test('only completed renders are timed: failures rethrow, suspensions retry', async () => {
  const boom = new Error('boom');
  expect(() =>
    wrapRender(() => {
      throw boom;
    })()
  ).toThrow(boom);
  await expect(wrapRender(() => Promise.reject(boom))()).rejects.toBe(boom);
  expect(recorded()).toBeUndefined();

  let attempts = 0;
  const render = wrapRender(() => {
    attempts += 1;
    if (attempts === 1) {
      throw Promise.resolve();
    }
    return 'done';
  });
  expect(() => render()).toThrow();
  expect(recorded()).toBeUndefined();
  expect(render()).toBe('done');
  expect(recorded()).toEqual([expect.objectContaining({ renderCount: 1 })]);
});
