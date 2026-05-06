import { $ } from '@qwik.dev/core';
import { createDocument } from '@qwik.dev/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDomContainer } from '../../client/dom-container';
import { implicit$FirstArg } from '../../shared/qrl/implicit_dollar';
import type { QRLInternal } from '../../shared/qrl/qrl-class';
import type { QRL } from '../../shared/qrl/qrl.public';
import type { Container, HostElement } from '../../shared/types';
import { delay, retryOnPromise } from '../../shared/utils/promises';
import { invoke, newInvokeContext } from '../../use/use-core';
import { Task } from '../../use/use-task';
import {
  type AsyncCtx,
  AsyncSignalFlags,
  EffectProperty,
  NEEDS_COMPUTATION,
  SignalFlags,
} from '../types';
import { clearAllEffects } from '../cleanup';
import { createSignal, createAsync$, createAsyncQrl } from '../signal.public';
import { getSubscriber } from '../subscriber';
import { vnode_newVirtual, vnode_setProp } from '../../client/vnode-utils';
import { ELEMENT_SEQ } from '../../shared/utils/markers';
import type { AsyncSignalImpl } from './async-signal-impl';

let computeInitialCalls = 0;
const computeInitialFn = async () => {
  computeInitialCalls++;
  return 42;
};

describe('async signal', () => {
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

  describe('expires and poll', () => {
    it('should store expires ms on instance', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 42, { expires: 50 }) as AsyncSignalImpl<number>;

        expect(signal.expires).toBe(50);
        expect(signal.$expires$).toBe(50);
        expect(signal.poll).toBe(true);
        expect(signal.$pollTimeoutId$).toBeUndefined();
      });
    });

    it('should store expires with poll: false without scheduling before consumers', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 42, {
          expires: 50,
          poll: false,
        }) as AsyncSignalImpl<number>;

        expect(signal.expires).toBe(50);
        expect(signal.$expires$).toBe(50);
        expect(signal.poll).toBe(false);
        expect(signal.$pollTimeoutId$).toBeUndefined();
      });
    });

    it('should update expires and reschedule with consumers', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 42, { expires: 0 }) as AsyncSignalImpl<number>;

        signal.expires = 1;
        expect(signal.$pollTimeoutId$).toBeUndefined();

        await retryOnPromise(async () => {
          effect$(() => signal.value);
        });

        expect(signal.$pollTimeoutId$).toBeDefined();

        signal.expires = 0;
        expect(signal.$pollTimeoutId$).toBeUndefined();
      });
    });

    it('should mark poll: false signals stale without recomputing', async () => {
      await withContainer(async () => {
        const ref = { computeCalls: 0 };
        const signal = createAsync$(
          async () => {
            ref.computeCalls++;
            return ref.computeCalls;
          },
          { expires: 10, poll: false }
        ) as AsyncSignalImpl<number>;

        await retryOnPromise(async () => {
          effect$(() => signal.value);
        });
        await signal.promise();

        expect(ref.computeCalls).toBe(1);
        expect(signal.$flags$ & SignalFlags.INVALID).toBe(0);
        expect(signal.$pollTimeoutId$).toBeDefined();

        await delay(20);

        expect(ref.computeCalls).toBe(1);
        expect(signal.$flags$ & SignalFlags.INVALID).toBe(SignalFlags.INVALID);
        expect(signal.$untrackedValue$).toBe(1);
        expect(signal.$pollTimeoutId$).toBeUndefined();
      });
    });

    it('should clear poll timeout on invalidate', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 42, { expires: 1 }) as AsyncSignalImpl<number>;

        await retryOnPromise(async () => {
          effect$(() => signal.value);
        });

        signal.invalidate();

        expect(signal.$pollTimeoutId$).toBeUndefined();
      });
    });

    it('should poll', async () => {
      await withContainer(async () => {
        const ref = { count: 42 };
        const signal = createAsync$(async () => ref.count++, {
          expires: 1,
        }) as AsyncSignalImpl<number>;

        await retryOnPromise(async () => {
          effect$(() => signal.value);
          await delay(10);
          expect(signal.value).toBeGreaterThan(42);
        });
      });
    });

    it('should preserve expires setting for SSR hydration', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 99, { expires: 75 }) as AsyncSignalImpl<number>;

        expect(signal.$expires$).toBe(75);
      });
    });

    it('should switch from polling to stale-only via poll setter', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 1, { expires: 10 }) as AsyncSignalImpl<number>;
        signal.untrackedValue = 1;
        signal.$flags$ &= ~SignalFlags.INVALID;
        signal.poll = false;
        (signal as any).$scheduleNextPoll$();

        await delay(20);

        expect(signal.$flags$ & SignalFlags.INVALID).toBe(SignalFlags.INVALID);
        expect(signal.$untrackedValue$).toBe(1);
        expect(signal.$pollTimeoutId$).toBeUndefined();
      });
    });

    it('should keep the current value while polling reruns with allowStale false', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 84, {
          expires: 10,
          allowStale: false,
        }) as AsyncSignalImpl<number>;
        signal.untrackedValue = 42;
        signal.$flags$ &= ~SignalFlags.INVALID;
        (signal as any).$scheduleNextPoll$();

        expect(signal.$pollTimeoutId$).toBeDefined();

        await delay(20);

        expect(signal.$flags$ & SignalFlags.INVALID).toBe(SignalFlags.INVALID);
        expect(signal.$untrackedValue$).toBe(42);
        expect(signal.$pollTimeoutId$).toBeUndefined();
      });
    });

    it('should clear the current value when poll: false invalidates with allowStale false', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 84, {
          expires: 10,
          poll: false,
          allowStale: false,
        }) as AsyncSignalImpl<number>;
        signal.untrackedValue = 42;
        signal.$flags$ &= ~SignalFlags.INVALID;
        (signal as any).$scheduleNextPoll$();

        expect(signal.$pollTimeoutId$).toBeDefined();

        await delay(20);

        expect(signal.$flags$ & SignalFlags.INVALID).toBe(SignalFlags.INVALID);
        expect(signal.$untrackedValue$).toBe(NEEDS_COMPUTATION);
        expect(signal.$pollTimeoutId$).toBeUndefined();
      });
    });

    it('should support deprecated negative interval for backward compat', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 42, {
          interval: -50,
        }) as AsyncSignalImpl<number>;

        expect(signal.expires).toBe(50);
        expect(signal.poll).toBe(false);
        // Deprecated interval getter returns negative for compat
        expect(signal.interval).toBe(-50);
      });
    });

    it('should support deprecated positive interval for backward compat', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 42, {
          interval: 50,
        }) as AsyncSignalImpl<number>;

        expect(signal.expires).toBe(50);
        expect(signal.poll).toBe(true);
        expect(signal.interval).toBe(50);
      });
    });

    it('should support deprecated interval setter for backward compat', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 42, {}) as AsyncSignalImpl<number>;

        signal.interval = -10;
        expect(signal.expires).toBe(10);
        expect(signal.poll).toBe(false);

        signal.interval = 20;
        expect(signal.expires).toBe(20);
        expect(signal.poll).toBe(true);
      });
    });
  });

  describe('invalidate info', () => {
    it('should expose invalidate info to the next computation', async () => {
      await withContainer(async () => {
        const infos: unknown[] = [];
        const signal = createAsync$(
          async ({ info }) => {
            infos.push(info);
            return infos.length;
          },
          { initial: 0 }
        ) as AsyncSignalImpl<number>;

        effect$(() => signal.value);
        await signal.promise();

        signal.invalidate('refresh');
        await signal.promise();

        expect(infos).toEqual([undefined, 'refresh']);
      });
    });

    it('should reset invalidate info after computation completes', async () => {
      await withContainer(async () => {
        const infos: unknown[] = [];
        const signal = createAsync$(
          async ({ info }) => {
            infos.push(info);
            return infos.length;
          },
          { initial: 0 }
        ) as AsyncSignalImpl<number>;

        effect$(() => signal.value);
        await signal.promise();

        signal.invalidate(true);
        await signal.promise();
        signal.invalidate();
        await signal.promise();

        expect(infos).toEqual([undefined, true, undefined]);
      });
    });

    it('should use the latest invalidate info before recalculation starts', async () => {
      await withContainer(async () => {
        const infos: unknown[] = [];
        const signal = createAsync$(
          async ({ info }) => {
            infos.push(info);
            return infos.length;
          },
          { initial: 0 }
        ) as AsyncSignalImpl<number>;

        effect$(() => signal.value);
        await signal.promise();

        signal.invalidate('first');
        signal.invalidate('second');
        await signal.promise();

        expect(infos).toEqual([undefined, 'second']);
      });
    });
  });

  describe('cleanup and abort', () => {
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
          abortSignal.addEventListener('abort', () => {
            if (ref.taskResolve) {
              ref.abortedBeforeTaskComplete = true;
            }
          });

          return new Promise<number>((resolve) => {
            ref.taskResolve = resolve;
          });
        }) as AsyncSignalImpl<number>;
        const signal2 = (await retryOnPromise(() =>
          createAsync$(async () => 0, { initial: 0 })
        )) as AsyncSignalImpl<number>;

        effect$(() => {
          return signal2.value;
        });

        signal.$computeIfNeeded$();

        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(ref.taskResolve).toBeDefined();

        const job = signal.$current$;
        expect(job).toBeTruthy();
        if (job) {
          signal.$requestCleanups$(job);
        }

        expect(ref.abortedBeforeTaskComplete).toBe(true);

        if (ref.taskResolve) {
          ref.taskResolve(99);
        }

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
  });

  describe('concurrency', () => {
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

    it('should ignore AbortError from a superseded computation', async () => {
      await withContainer(async () => {
        const ref = {
          started: 0,
          resolveCurrent: undefined as ((value: number) => void) | undefined,
        };

        const signal = createAsync$(
          async ({ abortSignal }) => {
            ref.started++;

            return new Promise<number>((resolve, reject) => {
              const onAbort = () => {
                const err = new Error('aborted');
                err.name = 'AbortError';
                reject(err);
              };
              abortSignal.addEventListener('abort', onAbort, { once: true });

              ref.resolveCurrent = (value: number) => {
                abortSignal.removeEventListener('abort', onAbort);
                resolve(value);
              };
            });
          },
          { initial: 0 }
        ) as AsyncSignalImpl<number>;

        effect$(() => signal.value);

        await retryOnPromise(() => {
          if (ref.started !== 1 || !ref.resolveCurrent) {
            throw new Promise((resolve) => setTimeout(resolve, 0));
          }
          return ref.started;
        });

        await signal.invalidate();

        await retryOnPromise(() => {
          if (ref.started !== 2 || !ref.resolveCurrent) {
            throw new Promise((resolve) => setTimeout(resolve, 0));
          }
          return ref.started;
        });

        expect(signal.error).toBeUndefined();
        expect(signal.value).toBe(0);

        ref.resolveCurrent!(7);
        await signal.promise();

        expect(signal.value).toBe(7);
        expect(signal.error).toBeUndefined();
        expect(signal.$untrackedValue$).toBe(7);
      });
    });

    it('should throw the retried promise instead of returning a stale value after an error', async () => {
      await withContainer(async () => {
        const ref = {
          started: 0,
          rejectFirst: undefined as ((error: Error) => void) | undefined,
          resolveSecond: undefined as ((value: number) => void) | undefined,
        };
        const signal = createAsync$(
          async () => {
            ref.started++;
            if (ref.started === 1) {
              return new Promise<number>((_resolve, reject) => {
                ref.rejectFirst = reject;
              });
            }
            return new Promise<number>((resolve) => {
              ref.resolveSecond = resolve;
            });
          },
          { initial: 0 }
        ) as AsyncSignalImpl<number>;

        effect$(() => signal.value);

        await retryOnPromise(() => {
          if (ref.started !== 1 || !ref.rejectFirst) {
            throw new Promise((resolve) => setTimeout(resolve, 0));
          }
          return ref.started;
        });

        await signal.invalidate();

        const failure = new Error('first failure');
        ref.rejectFirst!(failure);

        await retryOnPromise(() => {
          if (ref.started !== 2 || !ref.resolveSecond) {
            throw new Promise((resolve) => setTimeout(resolve, 0));
          }
          return ref.started;
        });

        let thrown: unknown;
        try {
          signal.value;
        } catch (err) {
          thrown = err;
        }

        expect(thrown).toBeInstanceOf(Promise);
        expect(signal.error).toBe(failure);
        expect(signal.$untrackedValue$).toBe(NEEDS_COMPUTATION);

        ref.resolveSecond!(2);
        await signal.promise();

        expect(signal.value).toBe(2);
        expect(signal.error).toBeUndefined();
      });
    });
  });

  describe('initial value', () => {
    it('should return initial value on first read', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 42, {
          initial: 10,
        }) as AsyncSignalImpl<number>;

        expect(signal.value).toBe(10);
      });
    });

    it('should invoke compute on first read without promise()', async () => {
      await withContainer(async () => {
        computeInitialCalls = 0;
        const signal = createAsync$(computeInitialFn, {
          initial: 10,
        }) as AsyncSignalImpl<number>;

        expect(signal.value).toBe(10);
        await true;
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

        expect(initCalls).toBe(1);
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
        const signal = createAsync$(async () => 42, {
          initial: 10,
          expires: 1,
        }) as AsyncSignalImpl<number>;

        expect(signal.value).toBe(10);
        expect(signal.expires).toBe(1);
        expect(signal.$expires$).toBe(1);
      });
    });

    it('initial value should be replaced by computed promise', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 42, {
          initial: 10,
        }) as AsyncSignalImpl<number>;

        expect(signal.value).toBe(10);

        await signal.promise();

        expect(signal.value).toBe(42);
      });
    });
  });

  describe('value setter', () => {
    it('should clear INVALID flag when writing value', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 42, {
          initial: 10,
        }) as AsyncSignalImpl<number>;

        // Signal starts INVALID
        expect(signal.$flags$ & SignalFlags.INVALID).toBeTruthy();

        signal.value = 99;

        // INVALID should be cleared
        expect(signal.$flags$ & SignalFlags.INVALID).toBe(0);
        expect(signal.value).toBe(99);
      });
    });

    it('should clear loading state when writing value', async () => {
      await withContainer(async () => {
        const ref = {
          resolve: undefined as ((value: number) => void) | undefined,
        };

        const signal = createAsync$(
          async () => {
            return new Promise<number>((resolve) => {
              ref.resolve = resolve;
            });
          },
          { initial: 0 }
        ) as AsyncSignalImpl<number>;

        effect$(() => signal.value);

        // Wait for computation to start
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(signal.loading).toBe(true);

        // Write value directly
        signal.value = 77;

        expect(signal.loading).toBe(false);
        expect(signal.value).toBe(77);
        expect(signal.error).toBeUndefined();

        // Resolve the pending computation — should not overwrite
        ref.resolve?.(1);
        await delay(0);

        // Value should remain what we set
        expect(signal.value).toBe(77);
      });
    });

    it('should clear error state when writing value', async () => {
      await withContainer(async () => {
        const signal = createAsync$(
          async () => {
            throw new Error('compute error');
          },
          { initial: 0 }
        ) as AsyncSignalImpl<number>;

        effect$(() => signal.value);
        await delay(10);

        expect(signal.error).toBeInstanceOf(Error);

        signal.value = 42;

        expect(signal.error).toBeUndefined();
        expect(signal.value).toBe(42);
      });
    });

    it('should reset poll interval when writing value', async () => {
      await withContainer(async () => {
        const interval = 50;
        const signal = createAsync$(async () => 42, {
          initial: 10,
          interval,
        }) as AsyncSignalImpl<number>;

        await retryOnPromise(async () => {
          effect$(() => signal.value);
        });
        await signal.promise();

        // Poll should be scheduled
        expect(signal.$pollTimeoutId$).toBeDefined();
        const oldTimeout = signal.$pollTimeoutId$;

        // Writing value should reschedule poll
        signal.value = 99;

        expect(signal.$pollTimeoutId$).toBeDefined();
        expect(signal.$pollTimeoutId$).not.toBe(oldTimeout);
      });
    });

    it('should fire effects when writing a new value', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 42, {
          initial: 10,
        }) as AsyncSignalImpl<number>;

        effect$(() => log.push(signal.value));

        // Write a different value
        signal.value = 99;
        await container.$renderPromise$;

        expect(log).toContain(99);
      });
    });

    it('should not trigger computation after writing value', async () => {
      await withContainer(async () => {
        let computeCalls = 0;
        const signal = createAsync$(
          async () => {
            computeCalls++;
            return computeCalls * 10;
          },
          { initial: 0 }
        ) as AsyncSignalImpl<number>;

        // Subscribe and wait for initial computation
        await retryOnPromise(() => {
          effect$(() => signal.value);
        });
        await signal.promise();
        const callsAfterInit = computeCalls;

        // Write value — should NOT trigger a new computation
        signal.value = 99;
        expect(signal.value).toBe(99);

        // No new computation should be triggered
        await delay(10);
        expect(computeCalls).toBe(callsAfterInit);
      });
    });
  });

  describe('clientOnly', () => {
    it('should set CLIENT_ONLY flag when clientOnly option is true', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 42, {
          initial: 10,
          clientOnly: true,
        }) as AsyncSignalImpl<number>;

        expect(signal.$flags$ & AsyncSignalFlags.CLIENT_ONLY).toBe(AsyncSignalFlags.CLIENT_ONLY);
      });
    });

    it('should not set CLIENT_ONLY flag when clientOnly option is false or omitted', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 42, {
          initial: 10,
        }) as AsyncSignalImpl<number>;

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

        await retryOnPromise(async () => {
          effect$(() => signal.value);
        });

        await signal.promise();

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

        expect(signal.$flags$ & AsyncSignalFlags.CLIENT_ONLY).toBe(AsyncSignalFlags.CLIENT_ONLY);
        expect(signal.$flags$ & AsyncSignalFlags.EAGER_CLEANUP).toBe(
          AsyncSignalFlags.EAGER_CLEANUP
        );

        await retryOnPromise(async () => {
          effect$(() => signal.value);
        });

        await signal.promise();
        expect(ref.computeCalls).toBe(1);

        clearAllEffects(container, task!);

        await delay(0);

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

  describe('allowStale', () => {
    it('should not set CLEAR_ON_INVALIDATE flag by default', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 42, {
          initial: 10,
        }) as AsyncSignalImpl<number>;

        expect(signal.$flags$ & AsyncSignalFlags.CLEAR_ON_INVALIDATE).toBe(0);
      });
    });

    it('should set CLEAR_ON_INVALIDATE flag when allowStale is false', async () => {
      await withContainer(async () => {
        const signal = createAsync$(async () => 42, {
          allowStale: false,
        }) as AsyncSignalImpl<number>;

        expect(signal.$flags$ & AsyncSignalFlags.CLEAR_ON_INVALIDATE).toBe(
          AsyncSignalFlags.CLEAR_ON_INVALIDATE
        );
      });
    });

    it('should throw when allowStale is false and initial is provided', async () => {
      await withContainer(async () => {
        expect(() => {
          createAsync$(async () => 42, {
            initial: 10,
            allowStale: false,
          });
        }).toThrow('allowStale: false and initial cannot be used together');
      });
    });

    it('should keep stale value on invalidate when allowStale is true (default)', async () => {
      await withContainer(async () => {
        const ref = {
          resolve: undefined as ((value: number) => void) | undefined,
          started: 0,
        };

        const signal = createAsync$(
          async () => {
            ref.started++;
            return new Promise<number>((resolve) => {
              ref.resolve = resolve;
            });
          },
          { initial: 0 }
        ) as AsyncSignalImpl<number>;

        effect$(() => signal.value);
        // Wait for first computation to start
        await retryOnPromise(() => {
          if (!ref.resolve) {
            throw new Promise((resolve) => setTimeout(resolve, 0));
          }
        });
        ref.resolve!(42);
        await signal.promise();
        expect(signal.value).toBe(42);

        // Invalidate — with allowStale=true (default), value should remain
        ref.resolve = undefined;
        await signal.invalidate();

        // Value is still the old one while recomputing
        expect(signal.$untrackedValue$).toBe(42);
      });
    });

    it('should clear value on invalidate when allowStale is false', async () => {
      await withContainer(async () => {
        const ref = {
          resolve: undefined as ((value: number) => void) | undefined,
          started: 0,
        };

        const signal = createAsync$(
          async () => {
            ref.started++;
            return new Promise<number>((resolve) => {
              ref.resolve = resolve;
            });
          },
          { allowStale: false }
        ) as AsyncSignalImpl<number>;

        effect$(() => {
          try {
            signal.value;
          } catch {
            // ignore promise throws during loading
          }
        });
        // Wait for first computation to start
        await retryOnPromise(() => {
          if (!ref.resolve) {
            throw new Promise((resolve) => setTimeout(resolve, 0));
          }
        });
        ref.resolve!(42);
        await signal.promise();
        expect(signal.value).toBe(42);

        // Invalidate — with allowStale=false, value should be cleared
        ref.resolve = undefined;
        await signal.invalidate();

        // Value should be NEEDS_COMPUTATION
        expect(signal.$untrackedValue$).toBe(NEEDS_COMPUTATION);
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
