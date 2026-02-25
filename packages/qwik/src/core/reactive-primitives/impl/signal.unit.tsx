import { $, _wrapProp, isBrowser } from '@qwik.dev/core';
import { createDocument } from '@qwik.dev/core/testing';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { getDomContainer } from '../../client/dom-container';
import { implicit$FirstArg } from '../../shared/qrl/implicit_dollar';
import { inlinedQrl } from '../../shared/qrl/qrl';
import { type QRLInternal } from '../../shared/qrl/qrl-class';
import { type QRL } from '../../shared/qrl/qrl.public';
import type { Container, HostElement } from '../../shared/types';
import { delay, retryOnPromise } from '../../shared/utils/promises';
import { invoke, newInvokeContext } from '../../use/use-core';
import { Task } from '../../use/use-task';
import { type AsyncCtx, AsyncSignalFlags, EffectProperty, SignalFlags } from '../types';
import { clearAllEffects } from '../cleanup';
import {
  createComputed$,
  createComputedQrl,
  createSerializer$,
  createSignal,
  createAsync$,
  createAsyncQrl,
  type ComputedSignal,
  type SerializerSignal,
  type Signal,
  type AsyncSignal,
} from '../signal.public';
import { getSubscriber } from '../subscriber';
import { vnode_newVirtual, vnode_setProp } from '../../client/vnode-utils';
import { ELEMENT_SEQ } from '../../shared/utils/markers';
import type { ComputedSignalImpl } from './computed-signal-impl';
import type { AsyncSignalImpl } from './async-signal-impl';

class Foo {
  constructor(public val: number = 0) {}
  update(val: number) {
    this.val = val;
  }
}

let computeInitialCalls = 0;
const computeInitialFn = async () => {
  computeInitialCalls++;
  return 42;
};

describe('signal types', () => {
  it('Signal<T>', () => () => {
    const signal = createSignal(1);
    expectTypeOf(signal).toEqualTypeOf<Signal<number>>();
  });
  it('ComputedSignal<T>', () => () => {
    const signal = createComputed$(() => 1);
    expectTypeOf(signal).toEqualTypeOf<ComputedSignal<number>>();
    const signal2 = createComputed$<number>(() => 1);
    expectTypeOf(signal2).toEqualTypeOf<ComputedSignal<number>>();
  });
  it('SerializerSignal<T, S>', () => () => {
    {
      const signal = createSerializer$({
        deserialize: () => new Foo(),
        serialize: (obj) => {
          expect(obj).toBeInstanceOf(Foo);
          return 1;
        },
      });
      expectTypeOf(signal).toEqualTypeOf<SerializerSignal<Foo>>();
      expectTypeOf(signal.value).toEqualTypeOf<Foo>();
    }
    {
      const stuff = createSignal(1);
      const signal = createSerializer$(() => ({
        deserialize: () => (isBrowser ? new Foo(stuff.value) : undefined),
        update: (foo) => {
          if (foo!.val !== stuff.value) {
            return;
          }
          foo!.update(stuff.value);
          return foo;
        },
      }));
      expectTypeOf(signal).toEqualTypeOf<SerializerSignal<undefined> | SerializerSignal<Foo>>();
      expectTypeOf(signal.value).toEqualTypeOf<Foo | undefined>();
    }
    {
      const signal = createSerializer$({
        // We have to specify the type here, sadly
        deserialize: (data?: number) => {
          expectTypeOf(data).toEqualTypeOf<number | undefined>();
          return new Foo();
        },
        serialize: (obj) => {
          expect(obj).toBeInstanceOf(Foo);
          return 1;
        },
      });
      expectTypeOf(signal).toEqualTypeOf<SerializerSignal<Foo>>();
      expectTypeOf(signal.value).toEqualTypeOf<Foo>();
    }
    {
      const signal = createSerializer$({
        deserialize: (data) => {
          expectTypeOf(data).toEqualTypeOf<number>();
          return new Foo();
        },
        initial: 3,
        serialize: (obj) => {
          expect(obj).toBeInstanceOf(Foo);
          return 1;
        },
      });
      expectTypeOf(signal).toEqualTypeOf<SerializerSignal<Foo>>();
      expectTypeOf(signal.value).toEqualTypeOf<Foo>();
    }
  });
  it('AsyncSignal<T>', () => async () => {
    const signal = createAsync$(() => Promise.resolve(42));
    expectTypeOf(signal).toEqualTypeOf<AsyncSignal<number>>();
    expectTypeOf(signal).toExtend<Signal<number>>();
    expectTypeOf(signal.trigger()).toEqualTypeOf<void>();
    expectTypeOf(await signal.promise()).toEqualTypeOf<void>();
    expectTypeOf(signal.value).toEqualTypeOf<number>();
    expectTypeOf(signal.loading).toEqualTypeOf<boolean>();
    expectTypeOf(signal.error).toEqualTypeOf<Error | undefined>();
    expectTypeOf(signal.interval).toEqualTypeOf<number>();
    expectTypeOf(signal.untrackedValue).toEqualTypeOf<number>();
    expectTypeOf(signal.abort()).toEqualTypeOf<void>();
    expectTypeOf(signal.invalidate()).toEqualTypeOf<void>();
  });
});

describe('signal', () => {
  const log: any[] = [];
  const delayMap = new Map();
  let container: Container = null!;
  let task: Task | null = null;
  beforeEach(() => {
    log.length = 0;
    const document = createDocument({ html: '<html><body q:container="paused"></body></html>' });
    container = getDomContainer(document.body);
    task = null;
  });

  afterEach(async () => {
    delayMap.clear();
    await container.$renderPromise$;
    container = null!;
  });

  describe('primitive', () => {
    it('basic read operation', async () => {
      await withContainer(() => {
        const signal = createSignal(123);
        expect(signal.value).toEqual(123);
      });
    });

    it('basic subscription operation', async () => {
      await withContainer(async () => {
        const signal = createSignal(123);
        expect(signal.value).toEqual(123);
        effect$(() => log.push(signal.value));
        expect(log).toEqual([123]);
        signal.value++;
        expect(log).toEqual([123]);
        await flushSignals();
        expect(log).toEqual([123, 124]);
      });
    });
  });

  describe('computed', () => {
    it('should simulate lazy loaded QRLs', async () => {
      const qrl = delayQrl($(() => 'OK'));
      expect(qrl.resolved).not.toBeDefined();
      await qrl.resolve();
      expect(qrl.resolved).toBeDefined();
    });

    it('basic subscription operation', async () => {
      await withContainer(async () => {
        const a = createSignal(2) as Signal<number>;
        const b = createSignal(10) as Signal<number>;
        await retryOnPromise(() => {
          let signal!: Signal<number>;
          effect$(() => {
            signal =
              signal ||
              createComputedQrl(
                delayQrl(
                  $(() => {
                    return a.value + b.value;
                  })
                )
              );
            if (!log.length) {
              expect(signal.untrackedValue).toEqual(12);
            }
            log.push(signal.value); // causes subscription
          });
          expect(log).toEqual([12]);
          a.value = a.untrackedValue + 1;
          b.value = b.untrackedValue + 10;
          // effects must run async
          expect(log).toEqual([12]);
        });
        await flushSignals();
        expect(log).toEqual([12, 23]);
      });
    });

    it('should track when recomputing computed signal', async () => {
      await withContainer(async () => {
        const a = createSignal(true) as Signal<boolean>;
        const b = createSignal(true) as Signal<boolean>;
        let signal!: ComputedSignalImpl<boolean>;

        (globalThis as any).waitPromiseResolve = null;
        const waitPromise = new Promise<void>((resolve) => {
          (globalThis as any).waitPromiseResolve = resolve;
        });

        await retryOnPromise(() =>
          effect$(async () => {
            signal =
              signal ||
              createComputedQrl(
                delayQrl(
                  $(() => {
                    const val = a.value || b.value;
                    if (!val) {
                      // resolve promise after next macro task
                      setTimeout(() => {
                        (globalThis as any).waitPromiseResolve!();
                      });
                    }
                    return val;
                  })
                )
              );
            log.push(signal.value); // causes subscription
          })
        );
        expect(log).toEqual([true]);
        a.value = !a.untrackedValue;
        b.value = !b.untrackedValue;

        await waitPromise;
        expect(log).toEqual([true, false]);
      });
    });

    it('trigger', async () => {
      await withContainer(async () => {
        const obj = { count: 0 };
        const computed = await retryOnPromise(() => {
          return createComputedQrl(
            delayQrl(
              $(() => {
                obj.count++;
                return obj;
              })
            )
          );
        });
        expect(computed.value).toBe(obj);
        expect(obj.count).toBe(1);
        effect$(() => log.push(computed!.value.count));
        await flushSignals();
        expect(log).toEqual([1]);
        expect(obj.count).toBe(1);
        // mark dirty but value remains shallow same after calc
        computed.$flags$ |= SignalFlags.INVALID;
        computed.value.count;
        await flushSignals();
        expect(log).toEqual([1]);
        expect(obj.count).toBe(2);
        // trigger notify
        computed.trigger();
        await flushSignals();
        expect(log).toEqual([1, 2]);
      });
    });
    describe('wrapped', () => {
      it('should not re-wrap wrapped signal', () => {
        const signal = createSignal(1);
        const wrapped = _wrapProp(signal);
        expect(wrapped).toHaveProperty('value', 1);
        expect(wrapped).not.toBe(signal);
        const wrapped2 = _wrapProp(wrapped);
        expect(wrapped2).toBe(wrapped);
      });
    });
    describe('async signal with poll', () => {
      it('should store poll ms on instance', async () => {
        await withContainer(async () => {
          const interval = 50;
          const signal = createAsync$(async () => 42, { interval }) as AsyncSignalImpl<number>;

          // Verify poll is stored on instance
          expect(signal.interval).toBe(interval);
          expect(signal.$interval$).toBe(interval);
          expect(signal.$pollTimeoutId$).toBeUndefined();
        });
      });

      it('should update interval and reschedule with consumers', async () => {
        await withContainer(async () => {
          const signal = createAsync$(async () => 42, { interval: 0 }) as AsyncSignalImpl<number>;

          signal.interval = 1;
          expect(signal.$pollTimeoutId$).toBeUndefined();

          await retryOnPromise(async () => {
            effect$(() => signal.value);
          });

          expect(signal.$pollTimeoutId$).toBeDefined();

          signal.interval = 0;
          expect(signal.$pollTimeoutId$).toBeUndefined();
        });
      });

      it('should clear poll timeout on invalidate', async () => {
        await withContainer(async () => {
          const interval = 1;
          const signal = createAsync$(async () => 42, { interval }) as AsyncSignalImpl<number>;

          // Subscribe to create effects
          await retryOnPromise(async () => {
            effect$(() => signal.value);
          });

          // Invalidate signal - should clear any pending poll timeout
          signal.invalidate();

          // Poll timeout should be cleared
          expect(signal.$pollTimeoutId$).toBeUndefined();
        });
      });

      it('should poll', async () => {
        await withContainer(async () => {
          const interval = 1;
          const ref = { count: 42 };
          const signal = createAsync$(async () => ref.count++, {
            interval,
          }) as AsyncSignalImpl<number>;

          // Subscribe to create effects
          await retryOnPromise(async () => {
            effect$(() => signal.value);
            await delay(10);
            expect(signal.value).toBeGreaterThan(42);
          });
        });
      });

      it('should preserve poll setting for SSR hydration', async () => {
        await withContainer(async () => {
          const interval = 75;
          const signal = createAsync$(async () => 99, { interval }) as AsyncSignalImpl<number>;

          // Verify poll is preserved on instance (for SSR scenarios)
          // Even on SSR (when isBrowser is false), the interval should be stored
          // so that if the signal is hydrated on the browser, polling can resume
          expect(signal.$interval$).toBe(interval);
        });
      });

      it('should run async cleanups before next compute', async () => {
        await withContainer(async () => {
          const dep = createSignal(0);
          const ref = { cleanupCalls: 0 };

          const signal = (await retryOnPromise(() =>
            createAsyncQrl(
              $(async ({ track, cleanup }: AsyncCtx) => {
                track(() => dep.value);
                cleanup(async () => {
                  await delay(10);
                  ref.cleanupCalls++;
                });
                return ref.cleanupCalls;
              })
            )
          )) as AsyncSignalImpl<number>;

          await retryOnPromise(() => {
            effect$(() => signal.value);
          });

          expect(signal.value).toBe(0);

          dep.value = 1;
          await signal.promise();

          expect(signal.value).toBe(1);
          expect(ref.cleanupCalls).toBe(1);
        });
      });

      it('should provide abortSignal that is aborted on cleanup', async () => {
        await withContainer(async () => {
          const dep = createSignal(0);
          const ref = { aborted: false };

          const signal = (await retryOnPromise(() =>
            createAsyncQrl(
              $(async ({ track, abortSignal }: AsyncCtx) => {
                track(() => dep.value);
                abortSignal.addEventListener('abort', () => {
                  ref.aborted = true;
                });
                return dep.value;
              })
            )
          )) as AsyncSignalImpl<number>;

          await retryOnPromise(() => {
            effect$(() => signal.value);
          });

          expect(signal.value).toBe(0);
          expect(ref.aborted).toBe(false);

          // Trigger re-computation which should run cleanup and abort
          dep.value = 1;
          await signal.promise();

          expect(signal.value).toBe(1);
          expect(ref.aborted).toBe(true);
        });
      });

      it('should lazily create abortController only when accessed', async () => {
        await withContainer(async () => {
          const signal = (await retryOnPromise(() =>
            createAsyncQrl(
              $(async () => {
                return 42;
              })
            )
          )) as AsyncSignalImpl<number>;

          await retryOnPromise(() => {
            effect$(() => signal.value);
          });

          // AbortController should not be created if abortSignal is never accessed
          const job = signal.$current$;
          expect(job).toBeTruthy();
          expect(job?.$abortController$).toBeUndefined();
        });
      });

      it('should create abortController when abortSignal is accessed', async () => {
        await withContainer(async () => {
          const ref = { capturedSignal: undefined as AbortSignal | undefined };

          const signal = (await retryOnPromise(() =>
            createAsyncQrl(
              $(async ({ abortSignal }: AsyncCtx) => {
                ref.capturedSignal = abortSignal;
                return 42;
              })
            )
          )) as AsyncSignalImpl<number>;

          await retryOnPromise(() => {
            effect$(() => signal.value);
          });

          // AbortController should be created when abortSignal is accessed
          const job = signal.$current$;
          expect(job).toBeTruthy();
          expect(job?.$abortController$).toBeInstanceOf(AbortController);
          expect(ref.capturedSignal).toBeInstanceOf(AbortSignal);
          expect(ref.capturedSignal?.aborted).toBe(false);
        });
      });

      it('should abort current computation via signal.abort()', async () => {
        await withContainer(async () => {
          const ref = {
            aborted: false,
            resolve: undefined as ((value: number) => void) | undefined,
          };

          const signal = createAsync$(
            async ({ abortSignal }) => {
              abortSignal.addEventListener('abort', () => {
                ref.aborted = true;
              });
              return new Promise<number>((resolve) => {
                ref.resolve = resolve;
              });
            },
            { initial: 0 }
          ) as AsyncSignalImpl<number>;

          effect$(() => signal.value);

          await new Promise((resolve) => setTimeout(resolve, 10));
          expect(ref.resolve).toBeDefined();

          signal.abort();

          expect(ref.aborted).toBe(true);

          ref.resolve?.(1);
          await delay(0);
        });
      });

      it('should forward reason to abortSignal when calling abort(reason)', async () => {
        await withContainer(async () => {
          const ref = {
            capturedReason: undefined as any,
            resolve: undefined as ((value: number) => void) | undefined,
          };

          const signal = createAsync$(
            async ({ abortSignal }) => {
              abortSignal.addEventListener('abort', () => {
                ref.capturedReason = abortSignal.reason;
              });
              return new Promise<number>((resolve) => {
                ref.resolve = resolve;
              });
            },
            { initial: 0 }
          ) as AsyncSignalImpl<number>;

          effect$(() => signal.value);

          await new Promise((resolve) => setTimeout(resolve, 10));
          expect(ref.resolve).toBeDefined();

          const customReason = new Error('Custom abort reason');
          signal.abort(customReason);

          expect(ref.capturedReason).toBe(customReason);

          ref.resolve?.(1);
          await delay(0);
        });
      });

      it('should abort immediately in $requestCleanups$ before waiting for task promise', async () => {
        await withContainer(async () => {
          const ref = {
            abortedBeforeTaskComplete: false,
            taskResolve: undefined as ((value: number) => void) | undefined,
          };

          const signal = createAsync$(async ({ abortSignal }) => {
            // Listen for abort
            abortSignal.addEventListener('abort', () => {
              // Check if task is still running (taskResolve exists)
              if (ref.taskResolve) {
                ref.abortedBeforeTaskComplete = true;
              }
            });

            // Create a long-running task
            return new Promise<number>((resolve) => {
              ref.taskResolve = resolve;
            });
          }) as AsyncSignalImpl<number>;
          // Subscribe with initial value to avoid promise throw
          const signal2 = (await retryOnPromise(() =>
            createAsync$(async () => 0, { initial: 0 })
          )) as AsyncSignalImpl<number>;

          effect$(() => {
            // Read signal2 to establish effect without throwing
            return signal2.value;
          });

          // Manually trigger computation for signal
          signal.$computeIfNeeded$();

          // Wait for task to start using a simple timeout
          await new Promise((resolve) => setTimeout(resolve, 10));

          // Verify task is running
          expect(ref.taskResolve).toBeDefined();

          // Request cleanup while task is still running
          const job = signal.$current$;
          expect(job).toBeTruthy();
          if (job) {
            signal.$requestCleanups$(job);
          }

          // Abort should be called immediately, before task completes
          expect(ref.abortedBeforeTaskComplete).toBe(true);

          // Clean up by resolving the task
          if (ref.taskResolve) {
            ref.taskResolve(99);
          }

          // Wait for cleanup to complete
          await delay(10);
        });
      });

      it('should abort current computation on timeout and set error', async () => {
        await withContainer(async () => {
          const ref = {
            aborted: false,
            resolve: undefined as ((value: number) => void) | undefined,
          };

          const signal = createAsync$(
            async ({ abortSignal }) => {
              abortSignal.addEventListener('abort', () => {
                ref.aborted = true;
              });
              return new Promise<number>((resolve) => {
                ref.resolve = resolve;
              });
            },
            { initial: 0, timeout: 5 }
          ) as AsyncSignalImpl<number>;

          effect$(() => signal.value);

          await delay(10);

          expect(ref.aborted).toBe(true);
          expect(signal.error).toBeInstanceOf(Error);
          expect(signal.error?.message).toContain('timeout');

          ref.resolve?.(1);
          await delay(0);
        });
      });

      it('should allow concurrent computations and apply newest completed value', async () => {
        await withContainer(async () => {
          const ref = {
            started: 0,
            resolvers: [] as Array<(value: number) => void>,
          };
          const signal = (await retryOnPromise(() =>
            createAsync$(
              async () => {
                ref.started++;
                return new Promise<number>((resolve) => {
                  ref.resolvers.push(resolve);
                });
              },
              { concurrency: 2, initial: 0 } as any
            )
          )) as AsyncSignalImpl<number>;

          effect$(() => signal.value);

          await retryOnPromise(() => {
            if (ref.started !== 1) {
              throw new Promise((resolve) => setTimeout(resolve, 0));
            }
            return ref.started;
          });

          await signal.invalidate();

          expect(ref.started).toBe(2);
          expect(ref.resolvers.length).toBe(2);

          ref.resolvers[1](2);

          await retryOnPromise(() => {
            if (signal.value !== 2) {
              throw new Promise((resolve) => setTimeout(resolve, 0));
            }
            return signal.value;
          });

          expect(signal.value).toBe(2);

          ref.resolvers[0](1);
          await delay(0);

          expect(signal.value).toBe(2);
        });
      });

      it('should eagerly cleanup on unsubscribe and abort', async () => {
        await withContainer(async () => {
          const ref = { aborted: false, cleanupCalls: 0 };

          const signal = createAsync$(
            async ({ abortSignal, cleanup }) => {
              abortSignal.addEventListener('abort', () => {
                ref.aborted = true;
              });
              cleanup(() => {
                ref.cleanupCalls++;
              });
              return 1;
            },
            { initial: 0, eagerCleanup: true }
          ) as AsyncSignalImpl<number>;

          effect$(() => signal.value);
          await signal.promise();

          expect(ref.cleanupCalls).toBe(0);
          expect(ref.aborted).toBe(false);

          clearAllEffects(container, task!);

          await delay(0);

          expect(ref.aborted).toBe(true);
          expect(ref.cleanupCalls).toBe(1);
        });
      });

      it('should only write errors from current computation', async () => {
        await withContainer(async () => {
          const ref = {
            started: 0,
            resolvers: [] as Array<(value: number) => void>,
            rejecters: [] as Array<(error: Error) => void>,
          };
          const signal = (await retryOnPromise(() =>
            createAsync$(
              async () => {
                ref.started++;
                return new Promise<number>((resolve, reject) => {
                  ref.resolvers.push(resolve);
                  ref.rejecters.push(reject);
                });
              },
              { concurrency: 2, initial: 0 } as any
            )
          )) as AsyncSignalImpl<number>;

          effect$(() => signal.value);

          await retryOnPromise(() => {
            if (ref.started !== 1) {
              throw new Promise((resolve) => setTimeout(resolve, 0));
            }
            return ref.started;
          });

          await signal.invalidate();

          await retryOnPromise(() => {
            if (ref.started !== 2) {
              throw new Promise((resolve) => setTimeout(resolve, 0));
            }
            return ref.started;
          });

          const error = new Error('non-current failure');
          ref.rejecters[0](error);
          ref.resolvers[1](5);

          await retryOnPromise(() => {
            if (signal.value !== 5) {
              throw new Promise((resolve) => setTimeout(resolve, 0));
            }
            return signal.value;
          });

          expect(signal.value).toBe(5);
          expect(signal.error).toBeUndefined();
        });
      });

      it('should return initial value on first read', async () => {
        await withContainer(async () => {
          const signal = createAsync$(async () => 42, {
            initial: 10,
          }) as AsyncSignalImpl<number>;

          // First read should return initial value without throwing
          expect(signal.value).toBe(10);
        });
      });

      it('should invoke compute on first read without promise()', async () => {
        await withContainer(async () => {
          computeInitialCalls = 0;
          const signal = createAsync$(computeInitialFn, {
            initial: 10,
          }) as AsyncSignalImpl<number>;

          // First read should return initial value
          expect(signal.value).toBe(10);
          await true;
          // Compute function should have been called to start computation
          expect(computeInitialCalls).toBe(1);
          await retryOnPromise(() => {
            if (signal.value !== 42) {
              throw new Promise((resolve) => setTimeout(resolve, 0));
            }
            return signal.value;
          });
          expect(signal.value).toBe(42);
        });
      });

      it('should eagerly evaluate initial function on construction', async () => {
        await withContainer(async () => {
          let initCalls = 0;
          const signal = createAsync$(async () => 42, {
            initial: () => {
              initCalls++;
              return 20;
            },
          }) as AsyncSignalImpl<number>;

          // Initial function should be called immediately during construction
          expect(initCalls).toBe(1);
          // First read should return initial value
          expect(signal.value).toBe(20);
        });
      });

      it('should propagate initial function errors immediately', async () => {
        await withContainer(async () => {
          const error = new Error('initial failed');
          expect(() => {
            createAsync$(async () => 42, {
              initial: () => {
                throw error;
              },
            });
          }).toThrow(error);
        });
      });

      it('initial and interval should work together', async () => {
        await withContainer(async () => {
          const interval = 1;
          const signal = createAsync$(async () => 42, {
            initial: 10,
            interval,
          }) as AsyncSignalImpl<number>;

          // Should have initial value
          expect(signal.value).toBe(10);
          // Should have poll interval stored
          expect(signal.interval).toBe(interval);
          expect(signal.$interval$).toBe(interval);
        });
      });

      it('initial value should be replaced by computed promise', async () => {
        await withContainer(async () => {
          const signal = createAsync$(async () => 42, {
            initial: 10,
          }) as AsyncSignalImpl<number>;

          // Start with initial value
          expect(signal.value).toBe(10);

          // Wait for the async promise to resolve
          await signal.promise();

          // After promise resolves, should have computed value
          expect(signal.value).toBe(42);
        });
      });

      describe('clientOnly', () => {
        it('should set CLIENT_ONLY flag when clientOnly option is true', async () => {
          await withContainer(async () => {
            const signal = createAsync$(async () => 42, {
              initial: 10,
              clientOnly: true,
            }) as AsyncSignalImpl<number>;

            // Verify flag is set on instance
            expect(signal.$flags$ & AsyncSignalFlags.CLIENT_ONLY).toBe(
              AsyncSignalFlags.CLIENT_ONLY
            );
          });
        });

        it('should not set CLIENT_ONLY flag when clientOnly option is false or omitted', async () => {
          await withContainer(async () => {
            const signal = createAsync$(async () => 42, {
              initial: 10,
            }) as AsyncSignalImpl<number>;

            // Verify flag is NOT set
            expect(signal.$flags$ & AsyncSignalFlags.CLIENT_ONLY).toBe(0);
          });
        });

        it('should compute on browser when clientOnly is set', async () => {
          await withContainer(async () => {
            const ref = { computeCalls: 0 };
            const signal = createAsync$(
              async () => {
                ref.computeCalls++;
                return 42;
              },
              { initial: 10, clientOnly: true }
            ) as AsyncSignalImpl<number>;

            // Subscribe to trigger computation
            await retryOnPromise(async () => {
              effect$(() => signal.value);
            });

            // Wait for computation to complete
            await signal.promise();

            // On browser, computation should complete normally
            expect(signal.value).toBe(42);
            expect(ref.computeCalls).toBe(1);
          });
        });

        it('should work with eagerCleanup together', async () => {
          await withContainer(async () => {
            const ref = {
              computeCalls: 0,
              cleanupCalls: 0,
              aborted: false,
            };

            const signal = createAsync$(
              async ({ abortSignal, cleanup }) => {
                ref.computeCalls++;
                abortSignal.addEventListener('abort', () => {
                  ref.aborted = true;
                });
                cleanup(() => {
                  ref.cleanupCalls++;
                });
                return 42;
              },
              { initial: 10, clientOnly: true, eagerCleanup: true }
            ) as AsyncSignalImpl<number>;

            // Both flags should be set
            expect(signal.$flags$ & AsyncSignalFlags.CLIENT_ONLY).toBe(
              AsyncSignalFlags.CLIENT_ONLY
            );
            expect(signal.$flags$ & AsyncSignalFlags.EAGER_CLEANUP).toBe(
              AsyncSignalFlags.EAGER_CLEANUP
            );

            // Subscribe and let computation start
            await retryOnPromise(async () => {
              effect$(() => signal.value);
            });

            await signal.promise();
            expect(ref.computeCalls).toBe(1);

            // Unsubscribe - should trigger eager cleanup
            clearAllEffects(container, task!);

            await delay(0);

            // eagerCleanup should have been triggered
            expect(ref.aborted).toBe(true);
            expect(ref.cleanupCalls).toBe(1);
          });
        });

        it('should work with abort reason together', async () => {
          await withContainer(async () => {
            const ref = {
              capturedReason: undefined as any,
              resolve: undefined as ((value: number) => void) | undefined,
            };

            const signal = createAsync$(
              async ({ abortSignal }) => {
                abortSignal.addEventListener('abort', () => {
                  ref.capturedReason = abortSignal.reason;
                });
                return new Promise<number>((resolve) => {
                  ref.resolve = resolve;
                });
              },
              { initial: 0, clientOnly: true }
            ) as AsyncSignalImpl<number>;

            effect$(() => signal.value);

            await new Promise((resolve) => setTimeout(resolve, 10));
            expect(ref.resolve).toBeDefined();

            const customReason = new Error('ClientOnly abort');
            signal.abort(customReason);

            expect(ref.capturedReason).toBe(customReason);

            ref.resolve?.(1);
            await delay(0);
          });
        });
      });
    });
  });
  ////////////////////////////////////////

  function withContainer<T>(fn: () => T): T {
    const ctx = newInvokeContext();
    ctx.$container$ = container;
    return invoke(ctx, fn);
  }

  async function flushSignals() {
    await container.$renderPromise$;
  }

  /** Simulates the QRLs being lazy loaded once per test. */
  function delayQrl<T>(qrl: QRL<() => T>): QRLInternal<() => T> {
    const iQrl = qrl as QRLInternal<() => T>;
    const hash = iQrl.$symbol$;
    let delayQrl = delayMap.get(hash);
    if (!delayQrl) {
      // console.log('DELAY', hash);
      delayQrl = inlinedQrl(
        Promise.resolve(iQrl.resolve()),
        'd_' + iQrl.$symbol$,
        iQrl.$captures$ as any
      ) as any;
      delayMap.set(hash, delayQrl);
    }
    return delayQrl;
  }

  function effectQrl(fnQrl: QRL<() => void>) {
    const qrl = fnQrl as QRLInternal<() => void>;
    const element: HostElement = vnode_newVirtual();
    task = task || new Task(0, 0, element, fnQrl as QRLInternal, undefined, null);
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
