import { describe, expect, expectTypeOf, it, test, vi, afterEach } from 'vitest';
import { component$ } from '../shared/component.public';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { Container, HostElement } from '../shared/types';
import { useResource$ } from './use-resource-dollar';
import { useSignal } from './use-signal';
import { useStore } from './use-store.public';
import { Task, TaskFlags, runTask, scheduleTask } from './use-task';
import { useTask$ } from './use-task-dollar';
import { useVisibleTask$ } from './use-visible-task-dollar';

describe('types', () => {
  test('track', () => () => {
    component$(() => {
      const sig = useSignal(1);
      const store = useStore({ count: 1 });
      useResource$(({ track }) => {
        expectTypeOf(track(store)).toEqualTypeOf(store);
        expectTypeOf(track(sig)).toEqualTypeOf<number>();
        expectTypeOf(track(() => sig.value)).toEqualTypeOf<number>();
        expectTypeOf(track(() => store.count)).toEqualTypeOf<number>();
      });
      useTask$(({ track }) => {
        expectTypeOf(track(store)).toEqualTypeOf(store);
        expectTypeOf(track(sig)).toEqualTypeOf<number>();
        expectTypeOf(track(() => sig.value)).toEqualTypeOf<number>();
        expectTypeOf(track(() => store.count)).toEqualTypeOf<number>();
      });
      return null;
    });
  });

  test('cleanup supports async callbacks', () => () => {
    component$(() => {
      useTask$(async ({ cleanup }) => {
        cleanup(async () => {});
        return async () => {};
      });
      useVisibleTask$(async ({ cleanup }) => {
        cleanup(async () => {});
        return async () => {};
      });
      return null;
    });
  });
});

const createMockContainer = () => {
  return {
    $locale$: 'en',
    handleError: vi.fn(),
  } as unknown as Container;
};

const createTask = (fn: (...args: any[]) => any) => {
  const host = {} as HostElement;
  const task = new Task(
    TaskFlags.DIRTY | TaskFlags.TASK,
    0,
    host,
    {
      getFn: vi.fn(() => fn),
    } as unknown as QRLInternal<unknown>,
    undefined,
    null
  );
  return { host, task };
};

describe('runTask', () => {
  it('awaits async cleanup registered with cleanup() before rerun', async () => {
    const log: string[] = [];
    const container = createMockContainer();
    let run = 0;
    const { host, task } = createTask(({ cleanup }: any) => {
      run++;
      log.push(`task:${run}`);
      cleanup(async () => {
        log.push(`cleanup:${run}:start`);
        await Promise.resolve();
        log.push(`cleanup:${run}:end`);
      });
    });

    runTask(task, container, host);
    task.$flags$ |= TaskFlags.DIRTY;
    const rerun = runTask(task, container, host);

    expect(log).toEqual(['task:1', 'cleanup:1:start']);
    await rerun;
    expect(log).toEqual(['task:1', 'cleanup:1:start', 'cleanup:1:end', 'task:2']);
  });

  it('awaits async cleanup returned from the task body before rerun', async () => {
    const log: string[] = [];
    const container = createMockContainer();
    let run = 0;
    const { host, task } = createTask(() => {
      run++;
      log.push(`task:${run}`);
      return async () => {
        log.push(`cleanup:${run}:start`);
        await Promise.resolve();
        log.push(`cleanup:${run}:end`);
      };
    });

    runTask(task, container, host);
    task.$flags$ |= TaskFlags.DIRTY;
    const rerun = runTask(task, container, host);

    expect(log).toEqual(['task:1', 'cleanup:1:start']);
    await rerun;
    expect(log).toEqual(['task:1', 'cleanup:1:start', 'cleanup:1:end', 'task:2']);
  });

  it('reports cleanup errors and still reruns the task', async () => {
    const error = new Error('cleanup failed');
    const container = createMockContainer();
    let run = 0;
    const { host, task } = createTask(({ cleanup }: any) => {
      run++;
      cleanup(async () => {
        if (run === 1) {
          throw error;
        }
      });
    });

    runTask(task, container, host);
    task.$flags$ |= TaskFlags.DIRTY;
    await runTask(task, container, host);

    expect(container.handleError).toHaveBeenCalledWith(error, host);
    expect(run).toBe(2);
    expect(task.$destroyPromise$).toBe(undefined);
    expect(task.$taskPromise$).toBe(null);
  });

  it('reuses the same in-flight rerun when cleanup is pending', async () => {
    const container = createMockContainer();
    let run = 0;
    let cleanupCalls = 0;
    let resolveCleanup!: () => void;
    const cleanupDone = new Promise<void>((resolve) => {
      resolveCleanup = resolve;
    });
    const { host, task } = createTask(({ cleanup }: any) => {
      run++;
      cleanup(async () => {
        cleanupCalls++;
        await cleanupDone;
      });
    });

    runTask(task, container, host);
    task.$flags$ |= TaskFlags.DIRTY;
    const rerun1 = runTask(task, container, host);
    task.$flags$ |= TaskFlags.DIRTY;
    const rerun2 = runTask(task, container, host);

    expect(rerun1).toBe(rerun2);
    expect(cleanupCalls).toBe(1);

    resolveCleanup();
    await rerun1;

    expect(run).toBe(2);
    expect(cleanupCalls).toBe(1);
  });
});

/**
 * scheduleTask tests — simulate the real scenario where a container is destroyed
 * during async qwikloader dispatch.
 *
 * Real-world flow:
 *   1. qwikloader dispatches an event asynchronously (dispatch is now async)
 *   2. During the await, a navigation/SPA transition destroys the container
 *      via DomContainer.$destroy$(), which:
 *        - truncates $rawStateData$ and $stateData$ to length 0
 *        - replaces $getObjectById$ with () => undefined
 *   3. The queued scheduleTask handler fires AFTER destruction
 *   4. deserializeCaptures() calls container.$getObjectById$(id) → returns undefined
 *   5. _captures[0] is undefined → crash on `task.$flags$ |= TaskFlags.DIRTY`
 *
 * The guard `if (!task?.$el$)` prevents this crash, matching the existing pattern
 * in WrappedSignalImpl.invalidate() which checks `if (this.$container$ && this.$hostElement$)`.
 */

// Mock getDomContainer to return our controlled container
vi.mock('../client/dom-container', () => ({
  getDomContainer: vi.fn(),
}));

vi.mock('../shared/vnode/vnode-dirty', () => ({
  markVNodeDirty: vi.fn(),
}));

describe('scheduleTask', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not throw when container was destroyed during async dispatch (_captures[0] is undefined)', async () => {
    // Simulate DomContainer.$destroy$() — $getObjectById$ returns undefined for all IDs,
    // exactly as the real $destroy$() method does:
    //   this.$getObjectById$ = () => undefined;
    //   this.$rawStateData$.length = 0;
    //   this.$stateData$.length = 0;
    const destroyedContainer = {
      $getObjectById$: () => undefined,
    };

    const { getDomContainer } = await import('../client/dom-container');
    vi.mocked(getDomContainer).mockReturnValue(destroyedContainer as any);

    const mockElement = {} as Element;
    const mockEvent = new Event('qinit');

    // scheduleTask is called by qwikloader with `this` = serialized captures string (e.g. "42").
    // Inside, it calls deserializeCaptures(container, "42") which does:
    //   container.$getObjectById$("42") → undefined (container destroyed)
    // So _captures becomes [undefined] and _captures[0] is undefined.
    // Without the guard, this crashes:
    //   TypeError: Cannot read properties of undefined (reading '$flags$')
    expect(() => {
      scheduleTask.call('42', mockEvent, mockElement);
    }).not.toThrow();
  });

  it('does not throw when task.$el$ is undefined due to truncated $stateData$', async () => {
    // Simulate a partially-destroyed container where the Task object itself was deserialized
    // but its $el$ (host VNode) resolved to undefined.
    //
    // This happens during inflate.ts Task deserialization:
    //   task.$el$ = v[3] as HostElement;
    // where v[3] comes from $stateData$[someId]. After $destroy$() truncates $stateData$
    // to length 0, any pending lazy deserialization of the VNode reference yields undefined.
    const task = new Task(
      TaskFlags.TASK,
      0,
      undefined as unknown as HostElement, // $el$ is undefined — VNode ref was cleared
      {} as QRLInternal<unknown>,
      undefined,
      null
    );

    const partialContainer = {
      $getObjectById$: () => task,
    };

    const { getDomContainer } = await import('../client/dom-container');
    vi.mocked(getDomContainer).mockReturnValue(partialContainer as any);

    const mockElement = {} as Element;
    const mockEvent = new Event('qinit');

    // The Task was deserialized but task.$el$ is undefined.
    // Without the guard, markVNodeDirty receives undefined vNode → crash:
    //   TypeError: Cannot read properties of undefined (reading 'dirty')
    expect(() => {
      scheduleTask.call('42', mockEvent, mockElement);
    }).not.toThrow();
  });

  it('calls markVNodeDirty when container is alive and task.$el$ is defined', async () => {
    const host = {} as HostElement;
    const task = new Task(
      TaskFlags.TASK,
      0,
      host,
      {} as QRLInternal<unknown>,
      undefined,
      null
    );

    const liveContainer = {
      $getObjectById$: () => task,
    };

    const { getDomContainer } = await import('../client/dom-container');
    vi.mocked(getDomContainer).mockReturnValue(liveContainer as any);

    const { markVNodeDirty } = await import('../shared/vnode/vnode-dirty');

    const mockElement = {} as Element;
    const mockEvent = new Event('qinit');

    scheduleTask.call('42', mockEvent, mockElement);

    expect(markVNodeDirty).toHaveBeenCalledWith(liveContainer, host, expect.any(Number));
    expect(task.$flags$ & TaskFlags.DIRTY).toBeTruthy();
  });
});
