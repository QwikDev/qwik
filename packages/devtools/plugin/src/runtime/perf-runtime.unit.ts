import { afterEach, expect, test } from 'vitest';
import { __qwik_install_perf_runtime__ } from './installers';

const keys = {
  ssrPerfStoreKey: '__TEST_SSR_PERF__',
  ssrPerfIndexKey: '__TEST_SSR_PERF_INDEX__',
  ssrPerfCountKey: '__TEST_SSR_PERF_COUNT__',
  ssrPerfIdKey: '__TEST_SSR_PERF_ID__',
};
const store = process as unknown as Record<string, unknown>;

afterEach(() => {
  for (const key of Object.values(keys)) {
    delete store[key];
  }
});

const installRuntime = () =>
  __qwik_install_perf_runtime__({
    ...keys,
    defaultPerfStore: { ssr: [], csr: [] },
    devtoolsGlobalKey: '__TEST_DEVTOOLS__',
    globalVersion: 1,
    hookKey: 'hook',
    pageMessageSource: 'test',
    perfStoreExpression: '',
    perfStoreKey: 'perf',
    renderEventType: 'render',
    csrPhase: 'csr',
    ssrPhase: 'ssr',
  });

test('server render counts exclude the component setup call', () => {
  const runtime = installRuntime();
  const viteId = '/src/app.tsx_App_component';

  runtime.commitComponentQrl({ component: 'App_component_abc', duration: 0, viteId });
  runtime.commit({ component: 'App_component_abc', duration: 12, viteId, renderCount: 1 });

  expect(store[keys.ssrPerfStoreKey]).toEqual([
    expect.objectContaining({ component: 'App_component_abc', duration: 12, ssrCount: 1 }),
  ]);
});

test('a later component setup keeps the recorded server render', () => {
  const runtime = installRuntime();
  const viteId = '/src/app.tsx_App_component';

  runtime.commit({ component: 'App_component_abc', duration: 12, viteId, renderCount: 1 });
  runtime.commitComponentQrl({ component: 'App_component_abc', duration: 0, viteId });

  expect(store[keys.ssrPerfStoreKey]).toEqual([
    expect.objectContaining({ duration: 12, renderCount: 1, ssrCount: 1 }),
  ]);
});
