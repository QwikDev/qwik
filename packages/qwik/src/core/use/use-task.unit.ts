import { describe, expect, expectTypeOf, it, test, vi } from 'vitest';
import { createComputedQrl, type ReadonlySignal } from '../reactive-primitives/signal.public';
import { component$ } from '../shared/component.public';
import { inlinedQrl } from '../shared/qrl/qrl';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import { trackComputedLoad } from '../shared/serdes/inflate';
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
      const readonlySig: ReadonlySignal<number> = sig;
      const store = useStore({ count: 1 });
      const valueStore = useStore({ value: 1 });
      useResource$(({ track }) => {
        expectTypeOf(track(store)).toEqualTypeOf(store);
        expectTypeOf(track(sig)).toEqualTypeOf<number>();
        expectTypeOf(track(() => sig.value)).toEqualTypeOf<number>();
        expectTypeOf(track(() => store.count)).toEqualTypeOf<number>();
      });
      useTask$(({ track }) => {
        expectTypeOf(track(store)).toEqualTypeOf(store);
        expectTypeOf(track(valueStore)).toEqualTypeOf(valueStore);
        expectTypeOf(track(sig)).toEqualTypeOf<number>();
        expectTypeOf(track(readonlySig)).toEqualTypeOf<number>();
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
    null
  );
  return { host, task };
};

describe('runTask', () => {
  it('reports a rejected thrown promise once and allows a later rerun', async () => {
    const error = new Error('dependency failed');
    const container = createMockContainer();
    const taskFn = vi.fn().mockImplementationOnce(() => {
      throw Promise.reject(error);
    });
    const { host, task } = createTask(taskFn);

    await expect(runTask(task, container, host)).resolves.toBeUndefined();

    expect(container.handleError).toHaveBeenCalledExactlyOnceWith(error, host, 'hook');
    expect(taskFn).toHaveBeenCalledTimes(1);
    expect(task.$flags$ & TaskFlags.DIRTY).toBe(0);
    expect(task.$taskPromise$).toBeNull();

    task.$flags$ |= TaskFlags.DIRTY;
    await runTask(task, container, host);
    expect(taskFn).toHaveBeenCalledTimes(2);
    expect(container.handleError).toHaveBeenCalledTimes(1);
  });

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

    expect(container.handleError).toHaveBeenCalledWith(error, host, 'hook');
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

  it('waits for a computed the task reaches before each run', async () => {
    const container = createMockContainer();
    const computed = createComputedQrl(inlinedQrl(() => 1, 's_computed'));
    let release!: () => void;
    const startLoadingComputedCode = () =>
      trackComputedLoad(computed, () => new Promise<void>((resolve) => (release = resolve)));
    const taskFn = vi.fn();
    const host = {} as HostElement;
    const task = new Task(
      TaskFlags.DIRTY | TaskFlags.TASK,
      0,
      host,
      inlinedQrl(taskFn, 's_task', [computed]) as QRLInternal<unknown>,
      null
    );

    startLoadingComputedCode();
    const firstRun = runTask(task, container, host);
    expect(taskFn).not.toHaveBeenCalled();
    release();
    await firstRun;
    expect(taskFn).toHaveBeenCalledTimes(1);

    startLoadingComputedCode();
    task.$flags$ |= TaskFlags.DIRTY;
    const secondRun = runTask(task, container, host);
    expect(taskFn).toHaveBeenCalledTimes(1);
    release();
    await secondRun;
    expect(taskFn).toHaveBeenCalledTimes(2);
  });

  it("reports a computed whose code wasn't preloaded in time as a qerror, without running the task", async () => {
    const dispatchEvent = vi.fn();
    const containerElement = { ownerDocument: { dispatchEvent } };
    const container = {
      ...createMockContainer(),
      element: containerElement,
    } as unknown as Container;
    const computed = createComputedQrl(inlinedQrl(() => 1, 's_computed'));
    let release!: () => void;
    trackComputedLoad(computed, () => new Promise<void>((resolve) => (release = resolve)));
    const taskFn = vi.fn();
    const host = {} as HostElement;
    const task = new Task(
      TaskFlags.DIRTY | TaskFlags.TASK,
      0,
      host,
      inlinedQrl(taskFn, 's_task', [computed]) as QRLInternal<unknown>,
      null
    );
    vi.useFakeTimers();
    try {
      const run = runTask(task, container, host);
      await vi.advanceTimersByTimeAsync(10_000);
      await run;

      expect(taskFn).not.toHaveBeenCalled();
      expect(container.handleError).not.toHaveBeenCalled();
      expect(dispatchEvent).toHaveBeenCalledOnce();
      const event = dispatchEvent.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe('qerror');
      expect(event.detail.importError).toBe('async');
      expect(event.detail.element).toBe(containerElement);
    } finally {
      vi.useRealTimers();
      release();
    }
  });
});
