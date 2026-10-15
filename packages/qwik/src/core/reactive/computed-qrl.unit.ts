import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOwner, runWithOwner } from '../runtime/owner';
import { createQRL } from '../shared/qrl/qrl-class';
import { _capturesObj, setCaptures } from '../shared/qrl/qrl-captures';
import { disposeSubscriber } from './cleanup';
import { useAsyncQrl, useComputedQrl, useSignal } from './public-api';
import type { ComputeCtx } from './public-types';
import type { Signal } from './signal';
import { _await } from './tracking';
import { Computed } from './computed';

afterEach(() => setCaptures(null));

describe('computed cancellation lifetime', () => {
  it('disposes a computed whose cleanup writes its source', () => {
    const source = useSignal(1);
    const cleanup = vi.fn(() => {
      source.value++;
    });
    const computed = runWithOwner(createOwner(null), () =>
      useComputedQrl(
        createQRL('chunk', 'dispose-source', ({ cleanup: onCleanup }) => {
          onCleanup(cleanup);
          return source.value * 2;
        })
      )
    );
    expect(computed.value).toBe(2);
    disposeSubscriber(computed);
    expect(source.value).toBe(2);
    expect(source.subs).toBeNull();
    expect(computed.deps).toBeNull();
    expect(computed.subs).toBeNull();
    expect(computed.value).toBe(2);
    disposeSubscriber(computed);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('does not restore tracking from an invalidated async computation', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    const trigger = useSignal(0);
    const oldSource = useSignal(1);
    const currentSource = useSignal(2);
    const computed = new Computed(
      null,
      async () => {
        if (trigger.value === 0) {
          (await _await(pending))();
          return oldSource.value;
        }
        return currentSource.value;
      },
      undefined,
      { initial: 0 }
    );
    expect(computed.value).toBe(0);
    const oldJob = computed.current!;
    trigger.value++;
    computed.invalidate();
    await computed.promise();
    expect(computed.value).toBe(2);
    release();
    await oldJob.promise;
    expect(oldSource.subs).toBeNull();
    expect(computed.deps).toEqual([trigger, currentSource]);
    disposeSubscriber(computed);
  });

  it.each(['returned', 'thrown', 'rejected'] as const)(
    'ignores an old %s computation while its replacement is pending',
    async (kind) => {
      let releaseOld!: (value: number) => void;
      let rejectOld!: (error: Error) => void;
      let releaseNew!: (value: number) => void;
      const first = new Promise<number>((resolve, reject) => {
        releaseOld = resolve;
        rejectOld = reject;
      });
      const second = new Promise<number>((resolve) => {
        releaseNew = resolve;
      });
      const body = vi.fn(() => {
        if (body.mock.calls.length > 1) {
          return second;
        }
        if (kind === 'thrown') {
          throw first;
        }
        return first;
      });
      const computed = new Computed(null, body, undefined, { initial: 0 });
      expect(computed.value).toBe(0);
      const oldJob = computed.current!;
      computed.invalidate();
      expect(computed.value).toBe(0);
      const currentJob = computed.current;
      if (kind === 'rejected') {
        rejectOld(new Error('old computation failed'));
      } else {
        releaseOld(1);
      }
      await oldJob.promise;
      expect(computed.current).toBe(currentJob);
      expect(computed.loading).toBe(true);
      expect(computed.error).toBeUndefined();
      expect(computed.untrackedValue).toBe(0);
      expect(body).toHaveBeenCalledTimes(2);
      releaseNew(2);
      await computed.promise();
      expect(computed.value).toBe(2);
      disposeSubscriber(computed);
    }
  );

  it('does not retry when timeout abort settles the input Promise', async () => {
    vi.useFakeTimers();
    try {
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const body = vi.fn(({ abortSignal }: ComputeCtx<number>) => {
        abortSignal.addEventListener('abort', release, { once: true });
        throw pending;
      });
      const computed = new Computed(null, body, undefined, { initial: 0, timeout: 1 });
      const waiting = computed.promise();
      await vi.advanceTimersByTimeAsync(1);
      await waiting;
      expect(body).toHaveBeenCalledTimes(1);
      expect(computed.error?.message).toBe('timeout 1ms');
      disposeSubscriber(computed);
    } finally {
      vi.useRealTimers();
    }
  });

  it.skipIf(!globalThis.gc).each(['stored', 'active'] as const)(
    'releases disposed computed context after %s cleanup settles',
    async (phase) => {
      function startCleanup() {
        let release!: () => void;
        const pending = new Promise<void>((resolve) => {
          release = resolve;
        });
        const container = {};
        const cleaned: string[] = [];
        const cleanups = [
          () => pending,
          () => {
            cleaned.push('tail');
          },
        ];
        const computed = new Computed(
          null,
          ({ cleanup }) => {
            for (let index = 0; index < cleanups.length; index++) {
              cleanup(cleanups[index]);
            }
            return new Promise<number>(() => {});
          },
          container as never,
          { initial: 0 }
        );
        if (phase === 'stored') {
          computed.storedCleanups = cleanups;
        } else {
          void computed.promise();
        }
        const waiting = computed.runUserCleanups();
        disposeSubscriber(computed);
        return { weak: new WeakRef(container), pending, release, waiting, cleaned };
      }
      const result = startCleanup();
      result.release();
      await result.pending;
      await result.waiting;
      for (let index = 0; index < 8; index++) {
        await new Promise<void>((resolve) => setImmediate(resolve));
        globalThis.gc!();
      }
      expect(result.weak.deref()).toBeUndefined();
      expect(result.cleaned).toEqual(['tail']);
    }
  );

  it('serializes cleanup batches and keeps queued cleanups after disposal', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cleaned: string[] = [];
    const computed = new Computed(null, () => 42);
    computed.storedCleanups = [
      () => {
        cleaned.push('first');
        return pending;
      },
    ];
    const first = computed.runUserCleanups();
    computed.storedCleanups = [
      () => {
        cleaned.push('second');
      },
    ];
    const second = computed.runUserCleanups();
    expect(cleaned).toEqual(['first']);
    disposeSubscriber(computed);
    release();
    await Promise.all([first, second]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(cleaned).toEqual(['first', 'second']);
  });

  it('preserves synchronous throws and consumes async rejection from late registered cleanup', async () => {
    let register!: (callback: () => void | Promise<void>) => void;
    const computed = new Computed<number>(null, ({ cleanup }) => {
      register = cleanup;
      return 42;
    });
    expect(computed.value).toBe(42);
    disposeSubscriber(computed);
    const error = new Error('late cleanup failure');
    expect(() =>
      register(() => {
        throw error;
      })
    ).toThrow(error);
    const cleanup = vi.fn(() => Promise.reject(error));
    register(cleanup);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it.each(['qrl', 'cleanup'] as const)(
    'does not start a disposed computed after waiting for %s',
    async (phase) => {
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const body = vi.fn(() => 42);
      const computed =
        phase === 'qrl'
          ? new Computed(
              createQRL<typeof body>('lazy', 'computed', null, () =>
                pending.then(() => ({ computed: body }))
              ),
              null,
              undefined,
              { initial: 0 }
            )
          : new Computed<number>(null, body, undefined, { initial: 0 });
      if (phase === 'cleanup') {
        computed.storedCleanups = [
          () => {
            return pending;
          },
        ];
      }
      const waiting = computed.promise();
      expect(computed.current).not.toBeNull();
      disposeSubscriber(computed);
      release();
      await waiting;
      await pending;
      await Promise.resolve();
      expect(body).not.toHaveBeenCalled();
      expect(computed.untrackedValue).toBe(0);
    }
  );

  it.each(['returned', 'thrown'] as const)(
    'ignores a disposed computed result from a %s Promise without retry or publication',
    async (kind) => {
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const body = vi.fn(() => {
        if (kind === 'thrown') {
          throw pending;
        }
        return pending.then(() => 42);
      });
      const computed = new Computed<number>(null, body, undefined, { initial: 0 });
      const waiting = computed.promise();
      expect(computed.current).not.toBeNull();
      disposeSubscriber(computed);
      expect(computed.current).toBeNull();
      release();
      await waiting;
      await pending;
      await Promise.resolve();
      expect(body).toHaveBeenCalledTimes(1);
      expect(computed.untrackedValue).toBe(0);
    }
  );

  it('runs computation and cleanup synchronously', () => {
    const cleanup = vi.fn();
    const computed = new Computed<number>(null, (ctx) => {
      ctx.cleanup(cleanup);
      return 42;
    });
    expect(computed.value).toBe(42);
    computed.invalidate();
    expect(computed.value).toBe(42);
    expect(cleanup).toHaveBeenCalledTimes(1);
    disposeSubscriber(computed);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});

describe.each([
  ['computed', useComputedQrl],
  ['async', useAsyncQrl],
] as const)('%s QRL captures', (_, createComputed) => {
  it('shares the loaded body while keeping each computed scope and receiver', async () => {
    const firstSource = useSignal(1);
    const secondSource = useSignal(3);
    const receivers: unknown[] = [];
    const body = function (this: unknown) {
      const [source, options, offsets] = _capturesObj._ as [
        Signal<number>,
        { offset: number },
        number[],
      ];
      receivers.push(this);
      return source.value + options.offset + offsets[0];
    };
    const load = vi.fn(async () => ({ body }));
    const firstQrl = createQRL('computed', 'body', null, load, [firstSource, { offset: 2 }, [7]]);
    const secondQrl = firstQrl.w([secondSource, { offset: 4 }, [9]]);
    const owner = createOwner(null);
    const first = runWithOwner(owner, () => createComputed(firstQrl));
    const second = runWithOwner(owner, () => createComputed(secondQrl));

    await Promise.all([first.promise(), second.promise()]);
    expect([first.value, second.value]).toEqual([10, 16]);
    expect(receivers).toEqual([first, second]);
    expect(load).toHaveBeenCalledOnce();
    expect(firstQrl.resolved).toBeUndefined();
    expect(secondQrl.resolved).toBeUndefined();

    const reload = vi.spyOn(firstQrl.$lazy$, '$load$');
    firstSource.value = 5;
    await first.promise();
    expect([first.value, second.value]).toEqual([14, 16]);
    expect(reload).not.toHaveBeenCalled();

    const resolved = await secondQrl.resolve();
    expect(resolved).not.toBe(body);
    expect(resolved()).toBe(16);
    expect(await secondQrl()).toBe(16);
    expect(firstQrl.resolved).toBeUndefined();
    disposeSubscriber(first);
    disposeSubscriber(second);
    expect(firstSource.subs).toBeNull();
    expect(secondSource.subs).toBeNull();
  });

  it('tracks reads after await and runs cleanup with raw captures', async () => {
    const before = useSignal(1);
    const after = useSignal(10);
    const cleanup = vi.fn();
    const body = async (ctx: ComputeCtx<number>) => {
      const [first, second] = _capturesObj._ as [Signal<number>, Signal<number>];
      ctx.cleanup(cleanup);
      const value = first.value;
      (await _await(Promise.resolve()))();
      return value + second.value;
    };
    const qrl = createQRL('computed', 'body', null, async () => ({ body }), [before, after]);
    const computed = runWithOwner(createOwner(null), () => createComputed(qrl));

    await computed.promise();
    expect(computed.value).toBe(11);
    expect(computed.deps).toEqual([before, after]);
    expect(qrl.resolved).toBeUndefined();
    after.value = 20;
    await computed.promise();
    expect(computed.value).toBe(21);
    expect(cleanup).toHaveBeenCalledOnce();
    disposeSubscriber(computed);
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(before.subs).toBeNull();
    expect(after.subs).toBeNull();
  });

  it('honors a public resolved override without restoring unused captures', async () => {
    const restoreCaptures = vi.fn(async () => ['unused']);
    const load = vi.fn(async () => ({ body: () => 1 }));
    const qrl = createQRL<() => number>('computed', 'body', null, load, '0', {
      restoreCaptures,
    } as any);
    qrl.resolved = () => 7;
    const computed = runWithOwner(createOwner(null), () => createComputed(qrl));

    expect(computed.value).toBe(7);
    expect(restoreCaptures).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    disposeSubscriber(computed);
  });

  it('keeps a synchronous preload failure inside the computed error state', async () => {
    const error = new Error('failed import');
    const qrl = createQRL<() => number>('computed', 'body', null, () => {
      throw error;
    });
    const computed = runWithOwner(createOwner(null), () => createComputed(qrl));

    await computed.promise();
    expect(computed.error).toBe(error);
    disposeSubscriber(computed);
  });
});
