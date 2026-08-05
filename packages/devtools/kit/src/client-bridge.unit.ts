import { afterEach, describe, expect, test, vi } from 'vitest';
import { createInPageBridge } from './client-bridge';

describe('createInPageBridge', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
      writable: true,
    });
  });

  test('returns empty values and no-op subscriptions when not in a browser', async () => {
    const bridge = createInPageBridge({ isBrowser: false });

    expect(await bridge.readPerfData()).toBeNull();
    expect(await bridge.readPreloadStore()).toBeNull();
    await expect(bridge.clearPreloadStore()).resolves.toBeUndefined();
    expect(bridge.subscribePreloadUpdates(vi.fn())).toBeNull();
    expect(await bridge.readComponentTree()).toBeNull();
    expect(await bridge.readSignals()).toBeNull();
    expect(await bridge.readVNodeTree()).toBeNull();
    expect(bridge.subscribeTreeUpdates(vi.fn())).toBeNull();
    expect(await bridge.readComponentDetail('Counter')).toBeNull();
    expect(await bridge.readNodeProps('node-1')).toBeNull();
    expect(await bridge.setSignalValue('Counter', undefined, 'count', 1)).toBe(false);
    expect(bridge.subscribeRenderEvents(vi.fn())).toBeNull();
  });

  test('reads page globals, hook snapshots, and writes signals in a browser', async () => {
    const perf = { ssr: [], csr: [] };
    const preloads = {
      entries: [],
      qrlRequests: [],
      startedAt: 1,
      clear: vi.fn(),
      _id: 1,
      _initialized: true,
      _byHref: {},
      _byId: {},
    };
    const componentTree = [
      { path: 'src/routes/index.tsx_Counter', name: 'Counter', signals: [], hooks: [] },
    ];
    const signals = { 'src/routes/index.tsx_Counter': [] };
    const vnodeTree = [{ id: 'node-1', name: 'Counter' }];
    const detail = [{ hookType: 'useSignal', variableName: 'count', data: 0 }];
    const props = { count: 0 };
    const hook = {
      getComponentTreeSnapshot: vi.fn(() => componentTree),
      getSignalsSnapshot: vi.fn(() => signals),
      getVNodeTree: vi.fn(() => vnodeTree),
      getComponentDetail: vi.fn(() => detail),
      getNodeProps: vi.fn(() => props),
      setSignalValue: vi.fn(() => true),
    };

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        __QWIK_DEVTOOLS__: {
          version: 1,
          perf,
          preloads,
          hook,
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      writable: true,
    });

    const bridge = createInPageBridge({ isBrowser: true });

    expect(await bridge.readPerfData()).toBe(perf);
    expect(await bridge.readPreloadStore()).toBe(preloads);
    await bridge.clearPreloadStore();
    expect(preloads.clear).toHaveBeenCalledOnce();
    expect(await bridge.readComponentTree()).toBe(componentTree);
    expect(await bridge.readSignals()).toBe(signals);
    expect(await bridge.readVNodeTree()).toBe(vnodeTree);
    expect(await bridge.readComponentDetail('Counter', 'chunk.js')).toBe(detail);
    expect(hook.getComponentDetail).toHaveBeenCalledWith('Counter', 'chunk.js');
    expect(await bridge.readNodeProps('node-1')).toBe(props);
    expect(hook.getNodeProps).toHaveBeenCalledWith('node-1');
    expect(await bridge.setSignalValue('Counter', 'chunk.js', 'count', 1)).toBe(true);
    expect(hook.setSignalValue).toHaveBeenCalledWith('Counter', 'chunk.js', 'count', 1);
  });
});
