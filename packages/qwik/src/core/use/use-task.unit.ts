import { describe, expect, expectTypeOf, it, test, vi } from 'vitest';
import { component$ } from '../shared/component.public';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { Container, HostElement } from '../shared/types';
import { useResource$ } from './use-resource-dollar';
import { useSignal } from './use-signal';
import { useStore } from './use-store.public';
import { Task, TaskFlags, runTask } from './use-task';
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
