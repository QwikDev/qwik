import { createDocument } from '@qwik.dev/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDomContainer } from '../../client/dom-container';
import { implicit$FirstArg } from '../../shared/qrl/implicit_dollar';
import type { QRLInternal } from '../../shared/qrl/qrl-class';
import type { QRL } from '../../shared/qrl/qrl.public';
import type { Container, HostElement } from '../../shared/types';
import { ELEMENT_SEQ } from '../../shared/utils/markers';
import { delay, retryOnPromise } from '../../shared/utils/promises';
import { invoke, newInvokeContext } from '../../use/use-core';
import { Task, TaskFlags } from '../../use/use-task';
import { vnode_newVirtual, vnode_setProp } from '../../client/vnode-utils';
import { AsyncSignalFlags, EffectProperty } from '../types';
import { createComputed$, createSignal } from '../signal.public';
import { getSubscriber } from '../subscriber';
import type { ComputedSignalImpl } from './computed-signal-impl';

describe('async computed', () => {
  const log: any[] = [];
  let container: Container = null!;
  let task: Task | null = null;
  beforeEach(() => {
    log.length = 0;
    const document = createDocument({ html: '<html><body q:container="paused"></body></html>' });
    container = getDomContainer(document.body);
    task = null;
  });

  afterEach(async () => {
    await container.$renderPromise$;
    container = null!;
  });

  it('should keep sync computeds synchronous without async state', async () => {
    await withContainer(async () => {
      const dep = createSignal(2);
      const signal = createComputed$(() => dep.value * 2) as ComputedSignalImpl<number>;

      expect(signal.value).toBe(4);
      expect(signal.$flags$ & AsyncSignalFlags.ASYNC_MODE).toBe(0);
      expect(signal.$current$?.$promise$).toBeFalsy();
      expect(signal.pending).toBe(false);
      expect(signal.error).toBeUndefined();

      dep.value = 3;
      expect(signal.value).toBe(6);
    });
  });

  it('should compute async values, throwing the promise on first read', async () => {
    await withContainer(async () => {
      const signal = createComputed$(async () => {
        await delay(1);
        return 42;
      }) as unknown as ComputedSignalImpl<number>;

      let thrown: unknown;
      try {
        signal.value;
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(Promise);

      const value = await retryOnPromise(() => signal.value);
      expect(value).toBe(42);
      expect(signal.$flags$ & AsyncSignalFlags.ASYNC_MODE).not.toBe(0);
      expect(signal.pending).toBe(false);
    });
  });

  it('should expose deprecated `.loading` / `.untrackedLoading` mirroring pending', async () => {
    await withContainer(async () => {
      const signal = createComputed$(async () => {
        await delay(1);
        return 42;
      }) as unknown as ComputedSignalImpl<number>;

      await retryOnPromise(() => signal.value);
      // Deprecated aliases read the same state as pending, so old code (e.g. route loaders) keeps working.
      expect(signal.loading).toBe(signal.pending);
      expect(signal.loading).toBe(false);

      // The deprecated setter writes through to the pending state.
      signal.untrackedLoading = true;
      expect(signal.$untrackedPending$).toBe(true);
    });
  });

  it('should auto-track dependencies read before an await', async () => {
    await withContainer(async () => {
      const dep = createSignal(1);
      const signal = createComputed$(async () => {
        const base = dep.value;
        await delay(1);
        return base * 10;
      }) as unknown as ComputedSignalImpl<number>;

      await retryOnPromise(() => {
        effect$(() => log.push(signal.value));
      });
      await signal.promise();
      expect(signal.untrackedValue).toBe(10);

      dep.value = 2;
      await delay(5);
      await signal.promise();
      expect(signal.untrackedValue).toBe(20);
    });
  });

  it('should track dependencies read after an await via ctx.track', async () => {
    await withContainer(async () => {
      const dep = createSignal(1);
      const signal = createComputed$(async (ctx) => {
        await delay(1);
        // the invoke context is lost after the first await: reads must use track()
        return ctx.track(dep) * 10;
      }) as unknown as ComputedSignalImpl<number>;

      await retryOnPromise(() => {
        effect$(() => log.push(signal.value));
      });
      await signal.promise();
      expect(signal.untrackedValue).toBe(10);

      dep.value = 2;
      await delay(5);
      await signal.promise();
      expect(signal.untrackedValue).toBe(20);
    });
  });

  it('should expose pending state and notify pending subscribers', async () => {
    await withContainer(async () => {
      const ref: { resolve?: (v: number) => void } = {};
      const signal = createComputed$(
        () => new Promise<number>((resolve) => (ref.resolve = resolve))
      ) as unknown as ComputedSignalImpl<number>;

      effect$(() => log.push(signal.pending));
      expect(log).toEqual([true]);

      ref.resolve!(7);
      await signal.promise();
      await container.$renderPromise$;
      expect(signal.untrackedPending).toBe(false);
      expect(signal.untrackedValue).toBe(7);
    });
  });

  it('should capture errors and rethrow them on read', async () => {
    await withContainer(async () => {
      const signal = createComputed$(async () => {
        await delay(1);
        throw new Error('compute failed');
      }) as unknown as ComputedSignalImpl<number>;

      await retryOnPromise(() => signal.pending);
      await signal.promise();

      expect(signal.error).toBeInstanceOf(Error);
      expect(signal.error?.message).toBe('compute failed');
      expect(() => signal.untrackedValue).toThrow('compute failed');
    });
  });

  it('should capture sync throws in .error and rethrow them on read', async () => {
    await withContainer(async () => {
      const dep = createSignal(0);
      const signal = createComputed$(() => {
        if (dep.value === 0) {
          throw new Error('sync oops');
        }
        return dep.value;
      }) as ComputedSignalImpl<number>;

      // reading .error triggers the computation
      const error = await retryOnPromise(() => signal.error);
      expect(error?.message).toBe('sync oops');
      expect(() => signal.untrackedValue).toThrow('sync oops');
      expect(signal.pending).toBe(false);
      expect(signal.$flags$ & AsyncSignalFlags.ASYNC_MODE).toBe(0);

      // recomputing clears the error
      dep.value = 1;
      expect(signal.value).toBe(1);
      expect(signal.error).toBeUndefined();
    });
  });

  it('should capture non-Error sync throws', async () => {
    await withContainer(async () => {
      const signal = createComputed$(() => {
        throw 'oops';
      }) as ComputedSignalImpl<never>;

      const error = await retryOnPromise(() => signal.error);
      expect(error).toBe('oops');
      let thrown: unknown;
      try {
        signal.untrackedValue;
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBe('oops');
    });
  });

  it('should provide the ComputeCtx argument to sync computeds', async () => {
    await withContainer(async () => {
      const dep = createSignal(1);
      const seen: { previous: unknown; info: unknown }[] = [];
      const signal = createComputed$((ctx) => {
        seen.push({ previous: ctx.previous, info: ctx.info });
        return dep.value * 10;
      }) as ComputedSignalImpl<number>;

      expect(signal.value).toBe(10);
      expect(seen).toEqual([{ previous: undefined, info: undefined }]);

      signal.invalidate('refresh');
      expect(signal.untrackedValue).toBe(10);
      expect(seen[1]).toEqual({ previous: 10, info: 'refresh' });

      // info is consumed by the computation it triggered
      signal.invalidate();
      expect(seen[2]).toEqual({ previous: 10, info: undefined });
    });
  });

  it('should provide previous and info to async computeds', async () => {
    await withContainer(async () => {
      const seen: { previous: unknown; info: unknown }[] = [];
      const signal = createComputed$(async (ctx) => {
        seen.push({ previous: ctx.previous, info: ctx.info });
        await delay(1);
        return (typeof ctx.previous === 'number' ? ctx.previous : 0) + 1;
      }) as unknown as ComputedSignalImpl<number>;

      await retryOnPromise(() => signal.value);
      expect(seen[0]).toEqual({ previous: undefined, info: undefined });
      expect(signal.untrackedValue).toBe(1);

      signal.invalidate('again');
      await signal.promise();
      expect(seen[1]).toEqual({ previous: 1, info: 'again' });
      expect(signal.untrackedValue).toBe(2);
    });
  });

  it('should run cleanups of the previous sync compute before recomputing', async () => {
    await withContainer(async () => {
      const dep = createSignal(1);
      const log: string[] = [];
      const signal = createComputed$((ctx) => {
        const value = dep.value;
        ctx.cleanup(() => {
          log.push(`cleanup ${value}`);
        });
        log.push(`compute ${value}`);
        return value;
      }) as ComputedSignalImpl<number>;

      expect(signal.value).toBe(1);
      dep.value = 2;
      expect(signal.value).toBe(2);
      expect(log).toEqual(['compute 1', 'cleanup 1', 'compute 2']);
    });
  });

  it('should accept AsyncSignal options like initial and timeout', async () => {
    await withContainer(async () => {
      const signal = createComputed$(
        async () => {
          await delay(1);
          return 42;
        },
        { initial: 5, timeout: 1000 }
      ) as unknown as ComputedSignalImpl<number>;

      // initial value prevents the throw on first read
      expect(signal.value).toBe(5);
      expect(signal.$timeoutMs$).toBe(1000);
      await signal.promise();
      expect(signal.untrackedValue).toBe(42);
    });
  });

  it('should resolve promise() once the value is computed', async () => {
    await withContainer(async () => {
      const signal = createComputed$(async () => {
        await delay(1);
        return 'done';
      }) as unknown as ComputedSignalImpl<string>;

      await signal.promise();
      expect(signal.untrackedValue).toBe('done');
    });
  });

  ////////////////////////////////////////

  function withContainer<T>(fn: () => T): T {
    const ctx = newInvokeContext();
    ctx.$container$ = container;
    return invoke(ctx, fn);
  }

  function effectQrl(fnQrl: QRL<() => void>) {
    const qrl = fnQrl as QRLInternal<() => void>;
    const element: HostElement = vnode_newVirtual();
    task = task || new Task(TaskFlags.TASK, 0, element, fnQrl as QRLInternal, null);
    vnode_setProp(element, ELEMENT_SEQ, [task]);
    if (!qrl.resolved) {
      throw qrl.resolve();
    } else {
      const ctx = newInvokeContext();
      ctx.$container$ = container;
      ctx.$effectSubscriber$ = getSubscriber(task, EffectProperty.COMPONENT);
      return invoke(ctx, qrl.getFn(ctx));
    }
  }

  const effect$ = /*#__PURE__*/ implicit$FirstArg(effectQrl);
});
