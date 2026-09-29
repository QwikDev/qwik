import { createDocument } from '@qwik.dev/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('should keep `.loading` to the own job, first load included', async () => {
    await withContainer(async () => {
      const signal = createComputed$(async () => {
        await delay(1);
        return 42;
      }) as unknown as ComputedSignalImpl<number>;

      expect(signal.loading).toBe(true);
      expect(signal.pending).toBe(false);
      await signal.promise();
      expect(signal.loading).toBe(false);

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

  describe('first contact', () => {
    it('should keep pending false while the first value computes', async () => {
      await withContainer(async () => {
        const ref: { resolve?: (v: number) => void } = {};
        const signal = createComputed$(
          () => new Promise<number>((resolve) => (ref.resolve = resolve))
        ) as unknown as ComputedSignalImpl<number>;

        effect$(() => log.push(signal.pending));
        expect(log).toEqual([false]);
        expect(signal.untrackedPending).toBe(true);

        ref.resolve!(7);
        await signal.promise();
        await container.$renderPromise$;
        expect(signal.pending).toBe(false);
        expect(signal.untrackedValue).toBe(7);
      });
    });

    it('should report pending beside the value during a refresh', async () => {
      await withContainer(async () => {
        const ref = { runs: 0 };
        const signal = createComputed$(async () => {
          await delay(1);
          return ++ref.runs;
        }) as unknown as ComputedSignalImpl<number>;
        await signal.promise();

        signal.invalidate();

        expect(signal.pending).toBe(true);
        expect(signal.untrackedValue).toBe(1);
        await signal.promise();
        expect(signal.pending).toBe(false);
        expect(signal.untrackedValue).toBe(2);
      });
    });

    it('should count an initial value as on screen', async () => {
      await withContainer(async () => {
        const signal = createComputed$(
          async () => {
            await delay(1);
            return 2;
          },
          { initial: 1 }
        ) as unknown as ComputedSignalImpl<number>;

        expect(signal.pending).toBe(true);
        expect(signal.untrackedValue).toBe(1);
        await signal.promise();
        expect(signal.pending).toBe(false);
      });
    });

    it('should keep pending false after clear() until a value lands', async () => {
      await withContainer(async () => {
        const signal = createComputed$(async () => {
          await delay(1);
          return 1;
        }) as unknown as ComputedSignalImpl<number>;
        await signal.promise();

        signal.clear();

        expect(signal.pending).toBe(false);
        await signal.promise();
        expect(signal.pending).toBe(false);
        expect(signal.untrackedValue).toBe(1);
      });
    });

    it('should not throw from .pending before a sync computed has a value', async () => {
      await withContainer(async () => {
        const source = createComputed$(async () => {
          await delay(1);
          return 2;
        }) as unknown as ComputedSignalImpl<number>;
        const derived = createComputed$(() => source.value * 10) as ComputedSignalImpl<number>;

        expect(derived.pending).toBe(false);
        await source.promise();
        expect(derived.value).toBe(20);
      });
    });

    it('should report pending while a shown sync computed waits on a promise to recompute', async () => {
      await withContainer(async () => {
        const source = createComputed$(async () => {
          await delay(1);
          return 2;
        }) as unknown as ComputedSignalImpl<number>;
        const derived = createComputed$(() => source.value * 10) as ComputedSignalImpl<number>;
        await retryOnPromise(() => derived.value);

        source.clear();
        derived.invalidate();

        expect(derived.pending).toBe(true);
        await source.promise();
        await delay(1);
        expect(derived.pending).toBe(false);
        expect(derived.value).toBe(20);
      });
    });

    it('should start the computation when .pending is read before a value exists', async () => {
      await withContainer(async () => {
        const ref = { runs: 0 };
        const signal = createComputed$(async () => {
          ref.runs++;
          await delay(1);
          return 1;
        }) as unknown as ComputedSignalImpl<number>;

        signal.pending;

        expect(ref.runs).toBe(1);
      });
    });
  });

  it('should rethrow a first failure from .value, leaving .error unset', async () => {
    await withContainer(async () => {
      const signal = createComputed$(async () => {
        await delay(1);
        throw new Error('compute failed');
      }) as unknown as ComputedSignalImpl<number>;

      await retryOnPromise(() => signal.pending);
      await signal.promise();

      expect(signal.error).toBeUndefined();
      expect(() => signal.untrackedValue).toThrow('compute failed');
    });
  });

  it('should rethrow a first sync throw from .value, leaving .error unset', async () => {
    await withContainer(async () => {
      const dep = createSignal(0);
      const signal = createComputed$(() => {
        if (dep.value === 0) {
          throw new Error('sync oops');
        }
        return dep.value;
      }) as ComputedSignalImpl<number>;

      expect(() => signal.untrackedValue).toThrow('sync oops');
      expect(signal.error).toBeUndefined();
      expect(signal.pending).toBe(false);
      expect(signal.$flags$ & AsyncSignalFlags.ASYNC_MODE).toBe(0);

      // recomputing clears the error
      dep.value = 1;
      expect(signal.value).toBe(1);
      expect(signal.error).toBeUndefined();
    });
  });

  it('should rethrow a first non-Error sync throw as is', async () => {
    await withContainer(async () => {
      const signal = createComputed$(() => {
        throw 'oops';
      }) as ComputedSignalImpl<never>;

      let thrown: unknown;
      try {
        signal.untrackedValue;
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBe('oops');
      expect(signal.error).toBeUndefined();
    });
  });

  it('should keep the last value beside .error when a refresh rejects', async () => {
    await withContainer(async () => {
      const ref = { fail: false };
      const signal = createComputed$(async () => {
        await delay(1);
        if (ref.fail) {
          throw new Error('refresh failed');
        }
        return 1;
      }) as unknown as ComputedSignalImpl<number>;
      await signal.promise();

      ref.fail = true;
      signal.invalidate();
      await signal.promise();

      expect(signal.value).toBe(1);
      expect(signal.error?.message).toBe('refresh failed');
      expect(signal.pending).toBe(false);
    });
  });

  it('should keep the last value beside .error when a sync recompute throws', async () => {
    await withContainer(async () => {
      const dep = createSignal(1);
      const signal = createComputed$(() => {
        if (dep.value === 0) {
          throw new Error('sync oops');
        }
        return dep.value;
      }) as ComputedSignalImpl<number>;
      expect(signal.value).toBe(1);

      dep.value = 0;
      expect(signal.value).toBe(1);
      expect(signal.error?.message).toBe('sync oops');

      dep.value = 2;
      expect(signal.value).toBe(2);
      expect(signal.error).toBeUndefined();
    });
  });

  it('should throw the error from .value after clear() when the recompute fails', async () => {
    await withContainer(async () => {
      const ref = { fail: false };
      const signal = createComputed$(async () => {
        await delay(1);
        if (ref.fail) {
          throw new Error('clear failed');
        }
        return 1;
      }) as unknown as ComputedSignalImpl<number>;
      await signal.promise();

      ref.fail = true;
      signal.clear();
      await signal.promise();

      expect(signal.error).toBeUndefined();
      expect(() => signal.untrackedValue).toThrow('clear failed');
    });
  });

  it('should drop the value left on the server on clear(), so the next failure stays off .error', async () => {
    await withContainer(async () => {
      const signal = createComputed$(async () => {
        await delay(1);
        throw new Error('refresh failed');
      }) as unknown as ComputedSignalImpl<number>;
      signal.$flags$ |= AsyncSignalFlags.VALUE_LEFT_ON_SERVER;
      await signal.promise();
      expect(signal.error?.message).toBe('refresh failed');

      signal.clear();
      await signal.promise();

      expect(signal.error).toBeUndefined();
      expect(() => signal.untrackedValue).toThrow('refresh failed');
    });
  });

  it('should serve initial beside .error when the first compute fails', async () => {
    await withContainer(async () => {
      const signal = createComputed$(
        async () => {
          await delay(1);
          throw new Error('first failed');
        },
        { initial: 5 }
      ) as unknown as ComputedSignalImpl<number>;
      await signal.promise();

      expect(signal.value).toBe(5);
      expect(signal.error?.message).toBe('first failed');
    });
  });

  it('should recompute a computed that reads a failed source on its last value, with the failure in .error', async () => {
    await withContainer(async () => {
      const ref = { fail: false };
      const factor = createSignal(10);
      const source = createComputed$(async () => {
        await delay(1);
        if (ref.fail) {
          throw new Error('source failed');
        }
        return 2;
      }) as unknown as ComputedSignalImpl<number>;
      const derived = createComputed$(
        () => source.value * factor.value
      ) as ComputedSignalImpl<number>;
      await retryOnPromise(() => derived.value);

      ref.fail = true;
      source.invalidate();
      await source.promise();

      expect(derived.value).toBe(20);
      expect(derived.error).toBe(source.error);

      factor.value = 100;
      expect(derived.value).toBe(200);
      expect(derived.error).toBe(source.error);
    });
  });

  it('should not recompute a computed when a signal it reads fails', async () => {
    await withContainer(async () => {
      const ref = { fail: false, runs: 0 };
      const source = createComputed$(async () => {
        await delay(1);
        if (ref.fail) {
          throw new Error('source failed');
        }
        return 2;
      }) as unknown as ComputedSignalImpl<number>;
      const derived = createComputed$(() => {
        ref.runs++;
        return source.value * 10;
      }) as ComputedSignalImpl<number>;
      await retryOnPromise(() => derived.value);
      const runsBefore = ref.runs;

      ref.fail = true;
      source.invalidate();
      await source.promise();

      expect(derived.error?.message).toBe('source failed');
      expect(ref.runs).toBe(runsBefore);
    });
  });

  it('should report a failure through several levels of computeds', async () => {
    await withContainer(async () => {
      const ref = { fail: false };
      const source = createComputed$(async () => {
        await delay(1);
        if (ref.fail) {
          throw new Error('source failed');
        }
        return 2;
      }) as unknown as ComputedSignalImpl<number>;
      const mid = createComputed$(() => source.value + 1) as ComputedSignalImpl<number>;
      const leaf = createComputed$(() => mid.value * 2) as ComputedSignalImpl<number>;
      await retryOnPromise(() => leaf.value);

      ref.fail = true;
      source.invalidate();
      await source.promise();

      expect(mid.error).toBe(source.error);
      expect(leaf.error).toBe(source.error);
      expect(leaf.value).toBe(6);
    });
  });

  it('should clear an inherited error when the source recovers with an unchanged value', async () => {
    await withContainer(async () => {
      const ref = { fail: false };
      const source = createComputed$(async () => {
        await delay(1);
        if (ref.fail) {
          throw new Error('source failed');
        }
        return 2;
      }) as unknown as ComputedSignalImpl<number>;
      const derived = createComputed$(() => source.value * 10) as ComputedSignalImpl<number>;
      await retryOnPromise(() => derived.value);

      ref.fail = true;
      source.invalidate();
      await source.promise();
      expect(derived.error?.message).toBe('source failed');

      ref.fail = false;
      source.invalidate();
      await source.promise();

      expect(derived.error).toBeUndefined();
      expect(derived.value).toBe(20);
    });
  });

  it('should wake .error readers when a recompute switches onto a failed signal and off it', async () => {
    await withContainer(async () => {
      const ref = { fail: false };
      const failing = createComputed$(async () => {
        await delay(1);
        if (ref.fail) {
          throw new Error('failing');
        }
        return 1;
      }) as unknown as ComputedSignalImpl<number>;
      const idle = createSignal(5);
      const cond = createSignal(false);
      const derived = createComputed$(() =>
        cond.value ? failing.value : idle.value
      ) as ComputedSignalImpl<number>;
      await retryOnPromise(() => failing.value);
      ref.fail = true;
      failing.invalidate();
      await failing.promise();
      expect(derived.value).toBe(5);
      const observer = createComputed$(() => log.push(derived.error?.message ?? 'none'));
      observer.value;

      cond.value = true;
      expect(derived.value).toBe(1);
      cond.value = false;
      expect(derived.value).toBe(5);

      expect(log).toEqual(['none', 'failing', 'none']);
    });
  });

  it('should wake .error readers when an async recompute switches onto a failed signal', async () => {
    await withContainer(async () => {
      const ref = { fail: false };
      const failing = createComputed$(async () => {
        await delay(1);
        if (ref.fail) {
          throw new Error('failing');
        }
        return 1;
      }) as unknown as ComputedSignalImpl<number>;
      const idle = createSignal(5);
      const cond = createSignal(false);
      const derived = createComputed$(async () => {
        const value = cond.value ? failing.value : idle.value;
        await delay(1);
        return value;
      }) as unknown as ComputedSignalImpl<number>;
      await retryOnPromise(() => failing.value);
      ref.fail = true;
      failing.invalidate();
      await failing.promise();
      await retryOnPromise(() => derived.value);
      const observer = createComputed$(() => log.push(derived.error?.message ?? 'none'));
      observer.value;

      cond.value = true;
      await delay(5);
      await derived.promise();

      expect(derived.value).toBe(1);
      expect(log).toEqual(['none', 'failing']);
    });
  });

  it("should recompute a computed that failed on its source's first load once the source recovers", async () => {
    await withContainer(async () => {
      const ref = { fail: true };
      const source = createComputed$(async () => {
        await delay(1);
        if (ref.fail) {
          throw new Error('first failed');
        }
        return 2;
      }) as unknown as ComputedSignalImpl<number>;
      const derived = createComputed$(() => source.value * 10) as ComputedSignalImpl<number>;
      await expect(retryOnPromise(() => derived.value)).rejects.toThrow('first failed');

      ref.fail = false;
      source.invalidate();
      await source.promise();

      expect(derived.value).toBe(20);
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

  it('should not recompute a sync computed read again while it recomputes', async () => {
    await withContainer(async () => {
      const ref = { orders: 1, groupedRuns: 0 };
      const orders = createComputed$(async () => {
        await delay(1);
        return ref.orders;
      }) as unknown as ComputedSignalImpl<number>;
      const pastOrders = createComputed$(async () => {
        const count = orders.value;
        await delay(1);
        return count * 10;
      }) as unknown as ComputedSignalImpl<number>;
      const grouped = createComputed$(() => {
        ref.groupedRuns++;
        return orders.value + pastOrders.value;
      }) as ComputedSignalImpl<number>;
      const busy = createComputed$(() => [
        pastOrders.pending,
        grouped.value,
      ]) as ComputedSignalImpl<unknown>;
      await retryOnPromise(() => busy.value);
      const runsBefore = ref.groupedRuns;

      ref.orders = 2;
      orders.invalidate();
      await orders.promise();

      expect(ref.groupedRuns - runsBefore).toBe(1);
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

  it('waits for lazy compute code before resolving promise()', async () => {
    await withContainer(async () => {
      const signal = createComputed$(async () => 'loaded') as ComputedSignalImpl<string>;
      const qrl = signal.$computeQrl$;
      const compute = qrl.resolved!;
      qrl.resolved = undefined;
      vi.spyOn(qrl, 'resolve').mockImplementation(async () => {
        qrl.resolved = compute;
        return compute;
      });

      await expect(signal.promise()).resolves.toBeUndefined();
      expect(signal.untrackedValue).toBe('loaded');
    });
  });

  it.each([0, 2])('disposes the first job with concurrency %s', async (concurrency) => {
    await withContainer(async () => {
      const ref = { aborted: false, cleanups: 0, finish: undefined as undefined | (() => void) };
      const signal = createComputed$(
        async ({ abortSignal, cleanup }) => {
          abortSignal.addEventListener('abort', () => {
            ref.aborted = true;
          });
          cleanup(() => {
            ref.cleanups++;
          });
          await new Promise<void>((resolve) => {
            ref.finish = resolve;
          });
          return 99;
        },
        { concurrency, initial: 7 }
      ) as ComputedSignalImpl<number>;

      const pending = signal.promise();
      signal.$dispose();
      signal.$dispose();
      ref.finish!();
      await pending;
      expect(ref.aborted).toBe(true);
      expect(ref.cleanups).toBe(1);
      expect(signal.untrackedValue).toBe(7);
    });
  });

  it('cleans up a synchronous computed with concurrency enabled', async () => {
    await withContainer(async () => {
      const ref = { cleanups: 0 };
      const signal = createComputed$(
        ({ cleanup }) => {
          cleanup(() => {
            ref.cleanups++;
          });
          return 7;
        },
        { concurrency: 2 }
      ) as ComputedSignalImpl<number>;

      expect(signal.value).toBe(7);
      signal.$dispose();
      signal.$dispose();
      expect(ref.cleanups).toBe(1);
    });
  });

  describe('pending through dependencies', () => {
    type Deferred = { value: number; fail: boolean; resolve?: () => void };

    const createDeferred = (): Deferred => ({ value: 1, fail: false });

    const settle = async (ref: Deferred) => {
      await vi.waitUntil(() => ref.resolve);
      const resolve = ref.resolve!;
      ref.resolve = undefined;
      resolve();
    };

    const createDeferredSource = (ref: Deferred) =>
      createComputed$(async () => {
        const value = ref.value;
        const shouldFail = ref.fail;
        await new Promise<void>((resolve) => (ref.resolve = resolve));
        if (shouldFail) {
          throw new Error('refresh failed');
        }
        return value;
      }) as unknown as ComputedSignalImpl<number>;

    const createDeferredLink = (ref: Deferred, source: ComputedSignalImpl<number>) =>
      createComputed$(async () => {
        const value = source.value * 10;
        await new Promise<void>((resolve) => (ref.resolve = resolve));
        return value;
      }) as unknown as ComputedSignalImpl<number>;

    const observePending = (signal: ComputedSignalImpl<unknown>) => {
      const observer = createComputed$(() => log.push(signal.pending));
      observer.value;
    };

    const pendingTransitions = () => log.filter((value, i) => value !== log[i - 1]);

    it('should be pending while a signal it reads refreshes, without recomputing', async () => {
      await withContainer(async () => {
        const ref = createDeferred();
        const counter = { runs: 0 };
        const source = createDeferredSource(ref);
        const derived = createComputed$(() => {
          counter.runs++;
          return source.value * 10;
        }) as ComputedSignalImpl<number>;
        const loading = retryOnPromise(() => derived.value);
        await settle(ref);
        await loading;
        observePending(derived);
        const runsBefore = counter.runs;

        ref.value = 2;
        source.invalidate();

        expect(derived.pending).toBe(true);
        expect(log).toEqual([false, true]);
        expect(counter.runs).toBe(runsBefore);
        await settle(ref);
        await source.promise();
        expect(derived.pending).toBe(false);
        expect(derived.value).toBe(20);
      });
    });

    it('should be pending through several levels of computeds', async () => {
      await withContainer(async () => {
        const ref = createDeferred();
        const orders = createDeferredSource(ref);
        const mid = createComputed$(() => orders.value + 1) as ComputedSignalImpl<number>;
        const leaf = createComputed$(() => mid.value * 2) as ComputedSignalImpl<number>;
        const loading = retryOnPromise(() => leaf.value);
        await settle(ref);
        await loading;

        orders.invalidate();

        expect(leaf.pending).toBe(true);
        expect(mid.pending).toBe(true);
        await settle(ref);
        await orders.promise();
        expect(leaf.pending).toBe(false);
      });
    });

    it('should stay pending through a handoff between async links', async () => {
      await withContainer(async () => {
        const ordersRef = createDeferred();
        const pastRef = createDeferred();
        const orders = createDeferredSource(ordersRef);
        const pastOrders = createDeferredLink(pastRef, orders);
        const grouped = createComputed$(() => pastOrders.value + 1) as ComputedSignalImpl<number>;
        const loading = retryOnPromise(() => grouped.value);
        await settle(ordersRef);
        await settle(pastRef);
        await loading;
        observePending(grouped);

        ordersRef.value = 2;
        orders.invalidate();
        await settle(ordersRef);
        await orders.promise();
        expect(grouped.pending).toBe(true);
        await settle(pastRef);
        await pastOrders.promise();

        expect(pendingTransitions()).toEqual([false, true, false]);
      });
    });

    it('should stay pending through a handoff when the source settles by a value write', async () => {
      await withContainer(async () => {
        const ordersRef = createDeferred();
        const pastRef = createDeferred();
        const orders = createDeferredSource(ordersRef);
        const pastOrders = createDeferredLink(pastRef, orders);
        const grouped = createComputed$(() => pastOrders.value + 1) as ComputedSignalImpl<number>;
        const loading = retryOnPromise(() => grouped.value);
        await settle(ordersRef);
        await settle(pastRef);
        await loading;
        observePending(grouped);

        orders.invalidate();
        expect(grouped.pending).toBe(true);
        orders.value = 2;
        expect(grouped.pending).toBe(true);
        await settle(pastRef);
        await pastOrders.promise();

        expect(pendingTransitions()).toEqual([false, true, false]);
        await settle(ordersRef);
      });
    });

    it('should stay pending while the next link waits on its previous cleanup', async () => {
      await withContainer(async () => {
        const ordersRef = createDeferred();
        const pastRef = createDeferred();
        const cleanupRef = createDeferred();
        const orders = createDeferredSource(ordersRef);
        const pastOrders = createComputed$(async ({ cleanup }) => {
          const value = orders.value * 10;
          cleanup(() => new Promise<void>((resolve) => (cleanupRef.resolve = resolve)));
          await new Promise<void>((resolve) => (pastRef.resolve = resolve));
          return value;
        }) as unknown as ComputedSignalImpl<number>;
        const grouped = createComputed$(() => pastOrders.value + 1) as ComputedSignalImpl<number>;
        const loading = retryOnPromise(() => grouped.value);
        await settle(ordersRef);
        await settle(pastRef);
        await loading;
        observePending(grouped);

        ordersRef.value = 2;
        orders.invalidate();
        await settle(ordersRef);
        await orders.promise();
        expect(grouped.pending).toBe(true);
        await settle(cleanupRef);
        await settle(pastRef);
        await pastOrders.promise();

        expect(pendingTransitions()).toEqual([false, true, false]);
      });
    });

    it('should keep each link pending until its own refresh settles', async () => {
      await withContainer(async () => {
        const ordersRef = createDeferred();
        const pastRef = createDeferred();
        const orders = createDeferredSource(ordersRef);
        const pastOrders = createDeferredLink(pastRef, orders);
        const grouped = createComputed$(() => pastOrders.value + 1) as ComputedSignalImpl<number>;
        const loading = retryOnPromise(() => grouped.value);
        await settle(ordersRef);
        await settle(pastRef);
        await loading;

        ordersRef.value = 2;
        orders.invalidate();

        expect([orders.pending, pastOrders.pending, grouped.pending]).toEqual([true, true, true]);
        await settle(ordersRef);
        await orders.promise();
        expect([orders.pending, pastOrders.pending, grouped.pending]).toEqual([false, true, true]);
        await settle(pastRef);
        await pastOrders.promise();
        expect([orders.pending, pastOrders.pending, grouped.pending]).toEqual([
          false,
          false,
          false,
        ]);
      });
    });

    it('should clear a link with its upstream when its input is unchanged', async () => {
      await withContainer(async () => {
        const ordersRef = createDeferred();
        const pastRef = createDeferred();
        const orders = createDeferredSource(ordersRef);
        const pastOrders = createDeferredLink(pastRef, orders);
        const grouped = createComputed$(() => pastOrders.value + 1) as ComputedSignalImpl<number>;
        const loading = retryOnPromise(() => grouped.value);
        await settle(ordersRef);
        await settle(pastRef);
        await loading;

        orders.invalidate();

        expect(grouped.pending).toBe(true);
        await settle(ordersRef);
        await orders.promise();
        expect([pastOrders.pending, grouped.pending]).toEqual([false, false]);
      });
    });

    it('should not make a source pending when a signal derived from it refreshes', async () => {
      await withContainer(async () => {
        const sourceRef = createDeferred();
        const derivedRef = createDeferred();
        const source = createDeferredSource(sourceRef);
        const derived = createDeferredLink(derivedRef, source);
        const loading = retryOnPromise(() => derived.value);
        await settle(sourceRef);
        await settle(derivedRef);
        await loading;

        derived.invalidate();

        expect(derived.pending).toBe(true);
        expect(source.pending).toBe(false);
        await settle(derivedRef);
      });
    });

    it('should not inherit pending from a signal whose .pending or .error it reads', async () => {
      await withContainer(async () => {
        const ref = createDeferred();
        const source = createDeferredSource(ref);
        const busy = createComputed$(() => source.pending) as ComputedSignalImpl<boolean>;
        const failed = createComputed$(() => !!source.error) as ComputedSignalImpl<boolean>;
        const loading = retryOnPromise(() => source.value);
        await settle(ref);
        await loading;
        expect([busy.value, failed.value]).toEqual([false, false]);

        source.invalidate();

        expect(source.pending).toBe(true);
        expect(busy.value).toBe(true);
        expect(busy.pending).toBe(false);
        expect(failed.pending).toBe(false);
        await settle(ref);
      });
    });

    it('should follow a recompute onto a refreshing signal and off it', async () => {
      await withContainer(async () => {
        const ref = createDeferred();
        const refreshing = createDeferredSource(ref);
        const idle = createSignal(5);
        const cond = createSignal(false);
        const derived = createComputed$(() =>
          cond.value ? refreshing.value : idle.value
        ) as ComputedSignalImpl<number>;
        const loading = retryOnPromise(() => refreshing.value);
        await settle(ref);
        await loading;
        expect(derived.value).toBe(5);
        observePending(derived);

        refreshing.invalidate();
        expect(refreshing.pending).toBe(true);
        expect(derived.pending).toBe(false);
        cond.value = true;
        expect(derived.value).toBe(1);
        cond.value = false;

        expect(pendingTransitions()).toEqual([false, true, false]);
        await settle(ref);
      });
    });

    it('should recompute on stale input while its source refreshes, staying pending', async () => {
      await withContainer(async () => {
        const ref = createDeferred();
        const source = createDeferredSource(ref);
        const factor = createSignal(10);
        const derived = createComputed$(
          () => source.value * factor.value
        ) as ComputedSignalImpl<number>;
        const loading = retryOnPromise(() => derived.value);
        await settle(ref);
        await loading;

        source.invalidate();
        expect(derived.pending).toBe(true);
        factor.value = 100;

        expect(derived.value).toBe(100);
        expect(derived.pending).toBe(true);
        await settle(ref);
        await source.promise();
        expect(derived.pending).toBe(false);
      });
    });

    it('should clear pending when the source refresh fails, inheriting .error', async () => {
      await withContainer(async () => {
        const ref = createDeferred();
        const source = createDeferredSource(ref);
        const derived = createComputed$(() => source.value * 10) as ComputedSignalImpl<number>;
        const loading = retryOnPromise(() => derived.value);
        await settle(ref);
        await loading;

        ref.fail = true;
        source.invalidate();
        expect(derived.pending).toBe(true);
        await settle(ref);
        await source.promise();

        expect(derived.pending).toBe(false);
        expect(derived.error).toBe(source.error);
      });
    });

    it('should clear pending when the source refresh is aborted', async () => {
      await withContainer(async () => {
        const ref = createDeferred();
        const source = createComputed$(async ({ abortSignal }) => {
          await new Promise<void>((resolve, reject) => {
            ref.resolve = resolve;
            abortSignal.addEventListener('abort', () => reject(abortSignal.reason));
          });
          return ref.value;
        }) as unknown as ComputedSignalImpl<number>;
        const derived = createComputed$(() => source.value * 10) as ComputedSignalImpl<number>;
        const loading = retryOnPromise(() => derived.value);
        await settle(ref);
        await loading;

        source.invalidate();
        expect(derived.pending).toBe(true);
        source.abort();
        await source.promise();

        expect(derived.pending).toBe(false);
        expect(derived.error).toBeUndefined();
      });
    });

    it('should not stay pending on a source disposed mid-refresh', async () => {
      await withContainer(async () => {
        const ref = createDeferred();
        const source = createDeferredSource(ref);
        const derived = createComputed$(() => source.value * 10) as ComputedSignalImpl<number>;
        const loading = retryOnPromise(() => derived.value);
        await settle(ref);
        await loading;

        source.invalidate();
        expect(derived.pending).toBe(true);
        source.$dispose();

        expect(derived.pending).toBe(false);
      });
    });

    it('should keep untrackedPending to its own job', async () => {
      await withContainer(async () => {
        const ref = createDeferred();
        const source = createDeferredSource(ref);
        const derived = createComputed$(() => source.value * 10) as ComputedSignalImpl<number>;
        const loading = retryOnPromise(() => derived.value);
        await settle(ref);
        await loading;

        source.invalidate();

        expect(derived.pending).toBe(true);
        expect(derived.untrackedPending).toBe(false);
        await settle(ref);
      });
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
