import { sync$ } from '@qwik.dev/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workerQrl } from './worker-qrl';
import { __clearWorkerRuntimeCache } from './worker-runtime-shared';

const nodeWorkerThreads = vi.hoisted(() => ({
  Worker: vi.fn(),
  fs: {
    existsSync: vi.fn(),
  },
}));

vi.mock('./worker.js?worker&url', () => ({
  default: '/mock/assets/worker.js',
}));

vi.mock('./worker.node.js?worker&url', () => ({
  default: '/mock/assets/worker.node.js',
}));

vi.mock('node:worker_threads', () => ({
  Worker: nodeWorkerThreads.Worker,
}));

describe('workerQrl', () => {
  afterEach(() => {
    __clearWorkerRuntimeCache();
    nodeWorkerThreads.Worker.mockReset();
    nodeWorkerThreads.fs.existsSync.mockReset();
    vi.unstubAllGlobals();
  });

  it('falls back to direct invocation when Worker is unavailable', async () => {
    vi.stubGlobal('Worker', undefined);
    vi.stubGlobal('process', undefined);

    const increment = workerQrl(sync$((count: number) => count + 1));

    await expect(increment(1)).resolves.toBe(2);
  });

  it('uses browser workers when Worker is available outside node runtimes', async () => {
    const browserWorkerEvents = new Map<string, Set<(value: any) => void>>();
    const BrowserWorker = vi.fn().mockImplementation(function (
      this: any,
      url: string,
      options: any
    ) {
      this.url = url;
      this.options = options;
      this.postMessage = vi.fn((message: [number, unknown]) => {
        queueMicrotask(() => {
          for (const handler of browserWorkerEvents.get('message') ?? []) {
            handler({ data: [message[0], true, 'from-browser-worker'] });
          }
        });
      });
      this.addEventListener = vi.fn((event: string, handler: (value: unknown) => void) => {
        const handlers = browserWorkerEvents.get(event) ?? new Set();
        handlers.add(handler as any);
        browserWorkerEvents.set(event, handlers);
      });
      this.removeEventListener = vi.fn((event: string, handler: (value: unknown) => void) => {
        browserWorkerEvents.get(event)?.delete(handler as any);
      });
    });

    vi.stubGlobal('Worker', BrowserWorker);
    vi.stubGlobal('process', undefined);

    const browserWorkerFn = workerQrl(
      sync$(() => {
        throw new Error('browser worker transport should be used when Worker is available');
      })
    );

    await expect(browserWorkerFn()).resolves.toBe('from-browser-worker');
    await expect(browserWorkerFn()).resolves.toBe('from-browser-worker');

    expect(BrowserWorker).toHaveBeenCalledTimes(1);

    const [workerUrl, workerOptions] = BrowserWorker.mock.calls[0];
    expect(workerUrl).toBe('/mock/assets/worker.js');
    expect(workerOptions).toEqual({
      name: expect.stringContaining('worker$('),
      type: 'module',
    });

    const workerInstance = BrowserWorker.mock.instances[0] as {
      addEventListener: ReturnType<typeof vi.fn>;
      postMessage: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
    };

    expect(workerInstance.postMessage).toHaveBeenCalledTimes(2);
    expect(workerInstance.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    expect(workerInstance.addEventListener).toHaveBeenCalledWith('error', expect.any(Function));
    expect(workerInstance.removeEventListener).toHaveBeenCalledWith(
      'message',
      expect.any(Function)
    );
    expect(workerInstance.removeEventListener).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('does not require DOM worker globals on the server fallback', async () => {
    vi.stubGlobal('Worker', undefined);
    vi.stubGlobal('process', undefined);
    vi.stubGlobal('SubmitEvent', undefined);
    vi.stubGlobal('HTMLFormElement', undefined);
    vi.stubGlobal('Event', undefined);
    vi.stubGlobal('Node', undefined);

    const echo = workerQrl(sync$((value: string) => value));

    await expect(echo('hello')).resolves.toBe('hello');
  });

  it('uses worker_threads in node runtimes', async () => {
    nodeWorkerThreads.fs.existsSync.mockImplementation((path: string | URL) => {
      return String(path).includes('/dist/');
    });

    nodeWorkerThreads.Worker.mockImplementation(function (
      this: any,
      url: URL,
      options: {
        execArgv?: string[];
        name: string;
        type: string;
        workerData?: { qrlBaseUrl: string };
      }
    ) {
      this.url = url;
      this.options = options;
      this.unref = vi.fn();
      this.postMessage = vi.fn((message: [number, unknown]) => {
        queueMicrotask(() => {
          this.messageHandler?.([message[0], true, 'from-node-worker']);
        });
      });
      this.on = vi.fn((event: string, handler: (value: unknown) => void) => {
        if (event === 'message') {
          this.messageHandler = handler;
        }
      });
      this.off = vi.fn((event: string, handler: (value: unknown) => void) => {
        if (event === 'message' && this.messageHandler === handler) {
          this.messageHandler = undefined;
        }
      });
    });

    vi.stubGlobal('Worker', undefined);
    vi.stubGlobal('process', {
      getBuiltinModule(id: string) {
        if (id === 'node:worker_threads') {
          return nodeWorkerThreads;
        }
        if (id === 'node:fs') {
          return nodeWorkerThreads.fs;
        }
        return undefined;
      },
      versions: { node: '22.18.0' },
    });

    const nodeWorkerFn = workerQrl(
      sync$(() => {
        throw new Error('worker_threads transport should be used in Node');
      })
    );

    await expect(nodeWorkerFn()).resolves.toBe('from-node-worker');
    await expect(nodeWorkerFn()).resolves.toBe('from-node-worker');

    expect(nodeWorkerThreads.Worker).toHaveBeenCalledTimes(1);

    const [workerUrl, workerOptions] = nodeWorkerThreads.Worker.mock.calls[0];
    expect(workerUrl).toBeInstanceOf(URL);
    expect(workerUrl.pathname.endsWith('/worker.node.js')).toBe(true);
    expect(workerOptions).toEqual({
      name: expect.stringContaining('worker$('),
      workerData: {
        qrlBaseUrl: expect.any(String),
      },
    });
    expect(new URL(workerOptions.workerData!.qrlBaseUrl)).toEqual(new URL('../build/', workerUrl));

    const workerInstance = nodeWorkerThreads.Worker.mock.instances[0] as {
      off: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
      postMessage: ReturnType<typeof vi.fn>;
      unref: ReturnType<typeof vi.fn>;
    };

    expect(workerInstance.unref).toHaveBeenCalledTimes(1);
    expect(workerInstance.postMessage).toHaveBeenCalledTimes(2);
    expect(workerInstance.on).toHaveBeenCalledWith('message', expect.any(Function));
    expect(workerInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(workerInstance.off).toHaveBeenCalledWith('message', expect.any(Function));
    expect(workerInstance.off).toHaveBeenCalledWith('error', expect.any(Function));

    const [[message]] = workerInstance.postMessage.mock.calls as [[unknown]];
    expect(message).toEqual([1, expect.anything()]);
  });
});
