import { $, _wrapProp, isBrowser } from '@qwik.dev/core';
import { createDocument } from '@qwik.dev/core/testing';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { getDomContainer } from '../../client/dom-container';
import { vnode_newVirtual, vnode_setProp } from '../../client/vnode-utils';
import { implicit$FirstArg } from '../../shared/qrl/implicit_dollar';
import { inlinedQrl } from '../../shared/qrl/qrl';
import { type QRLInternal } from '../../shared/qrl/qrl-class';
import { type QRL } from '../../shared/qrl/qrl.public';
import type { Container, HostElement } from '../../shared/types';
import { ELEMENT_SEQ } from '../../shared/utils/markers';
import { retryOnPromise } from '../../shared/utils/promises';
import { invoke, newInvokeContext } from '../../use/use-core';
import { Task, TaskFlags } from '../../use/use-task';
import {
  createComputed$,
  createComputedQrl,
  createSerializer$,
  createSignal,
  type AsyncSignal,
  type ComputedSignal,
  type SerializerSignal,
  type Signal,
} from '../signal.public';
import { getSubscriber } from '../subscriber';
import { EffectProperty, ComputedSignalFlags } from '../types';
import type { ComputedSignalImpl } from './computed-signal-impl';

class Foo {
  constructor(public val: number = 0) {}
  update(val: number) {
    this.val = val;
  }
}

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
    const signal = createComputed$(() => Promise.resolve(42));
    expectTypeOf(signal).toEqualTypeOf<AsyncSignal<number>>();
    expectTypeOf(signal).toExtend<Signal<number>>();
    expectTypeOf(signal.trigger()).toEqualTypeOf<void>();
    expectTypeOf(await signal.promise()).toEqualTypeOf<void>();
    expectTypeOf(signal.value).toEqualTypeOf<number>();
    expectTypeOf(signal.pending).toEqualTypeOf<boolean>();
    expectTypeOf(signal).not.toHaveProperty('loading');
    expectTypeOf(signal.error).toEqualTypeOf<Error | undefined>();
    expectTypeOf(signal.untrackedValue).toEqualTypeOf<number>();
    expectTypeOf(signal.abort()).toEqualTypeOf<void>();
    expectTypeOf(signal.invalidate()).toEqualTypeOf<void>();
    expectTypeOf(signal.invalidate('info')).toEqualTypeOf<void>();
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
        const computed = createComputed$(() => {
          obj.count++;
          return obj;
        });
        expect(computed.value).toBe(obj);
        expect(obj.count).toBe(1);
        effect$(() => log.push(computed!.value.count));
        await flushSignals();
        expect(log).toEqual([1]);
        expect(obj.count).toBe(1);
        // mark dirty but value remains shallow same after calc
        (computed as ComputedSignalImpl<typeof obj>).$flags$ |= ComputedSignalFlags.INVALID;
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

    it('should recompute once per write when reading a signal directly and through a computed', async () => {
      await withContainer(async () => {
        const runs: string[] = [];
        const price = createSignal(10);
        const tax = createComputed$(() => price.value * 0.2);
        const total = createComputed$(() => {
          const p = price.value;
          const t = tax.value;
          runs.push(`${p} + ${t}`);
          return p + t;
        });
        effect$(() => log.push(total.value));
        price.value = 20;
        await flushSignals();
        expect(runs).toEqual(['10 + 2', '20 + 4']);
        expect(log).toEqual([12, 24]);
      });
    });

    it('should not read a stale computed two levels upstream', async () => {
      await withContainer(async () => {
        const runs: string[] = [];
        const price = createSignal(10);
        const tax = createComputed$(() => price.value * 0.2);
        const roundedTax = createComputed$(() => Math.round(tax.value));
        const total = createComputed$(() => {
          const p = price.value;
          const t = roundedTax.value;
          runs.push(`${p} + ${t}`);
          return p + t;
        });
        effect$(() => log.push(total.value));
        price.value = 20;
        await flushSignals();
        expect(runs).toEqual(['10 + 2', '20 + 4']);
        expect(log).toEqual([12, 24]);
      });
    });

    it('should not recompute when an upstream computed keeps its value', async () => {
      await withContainer(async () => {
        const runs: string[] = [];
        const price = createSignal(10);
        const isExpensive = createComputed$(() => price.value > 100);
        const label = createComputed$(() => {
          const expensive = isExpensive.value;
          runs.push(`expensive: ${expensive}`);
          return expensive ? 'expensive' : 'cheap';
        });
        effect$(() => log.push(label.value));
        price.value = 20;
        await flushSignals();
        expect(label.value).toBe('cheap');
        expect(runs).toEqual(['expensive: false']);
        expect(log).toEqual(['cheap']);
      });
    });

    it('should not read a stale computed after retrying a suspended recompute', async () => {
      await withContainer(async () => {
        const runs: string[] = [];
        const suspense: { promise?: Promise<void> } = {};
        const price = createSignal(10);
        const tax = createComputed$(() => {
          const t = price.value * 0.2;
          if (suspense.promise) {
            throw suspense.promise;
          }
          return t;
        });
        const roundedTax = createComputed$(() => Math.round(tax.value));
        const total = createComputed$(() => {
          const p = price.value;
          if (suspense.promise) {
            throw suspense.promise;
          }
          const t = roundedTax.value;
          runs.push(`${p} + ${t}`);
          return p + t;
        });
        effect$(() => log.push(total.value));
        const suspended = Promise.resolve();
        suspense.promise = suspended;
        price.value = 20;
        suspense.promise = undefined;
        await suspended;
        await flushSignals();
        expect(runs).toEqual(['10 + 2', '20 + 4']);
        expect(log).toEqual([12, 24]);
      });
    });

    it('should not read a stale computed after a source suspends while resolving it', async () => {
      await withContainer(async () => {
        const runs: string[] = [];
        const suspense: { promise?: Promise<void> } = {};
        const price = createSignal(10);
        const tax = createComputed$(() => {
          const t = price.value * 0.2;
          if (suspense.promise) {
            throw suspense.promise;
          }
          return t;
        });
        const roundedTax = createComputed$(() => Math.round(tax.value));
        const total = createComputed$(() => {
          const p = price.value;
          const t = roundedTax.value;
          runs.push(`${p} + ${t}`);
          return p + t;
        });
        effect$(() => log.push(total.value));
        const suspended = Promise.resolve();
        suspense.promise = suspended;
        price.value = 20;
        suspense.promise = undefined;
        await suspended;
        await flushSignals();
        expect(runs).toEqual(['10 + 2', '20 + 4']);
        expect(log).toEqual([12, 24]);
      });
    });

    it('should not read a stale computed derived from a wrapped signal', async () => {
      await withContainer(async () => {
        const runs: string[] = [];
        const price = createSignal(10);
        const wrappedPrice = _wrapProp(price);
        const tax = createComputed$(() => wrappedPrice.value * 0.2);
        const total = createComputed$(() => {
          const p = price.value;
          const t = tax.value;
          runs.push(`${p} + ${t}`);
          return p + t;
        });
        effect$(() => log.push(total.value));
        price.value = 20;
        await flushSignals();
        expect(runs).toEqual(['10 + 2', '20 + 4']);
        expect(log).toEqual([12, 24]);
      });
    });

    it('should not read a stale computed derived from another computed error', async () => {
      await withContainer(async () => {
        const runs: string[] = [];
        const input = createSignal('1');
        const parsed = createComputed$(() => {
          const parsedInput = Number(input.value);
          if (Number.isNaN(parsedInput)) {
            throw new Error('not a number');
          }
          return parsedInput;
        });
        const message = createComputed$(() => parsed.error?.message ?? 'ok');
        const summary = createComputed$(() => {
          const line = `${input.value}: ${message.value}`;
          runs.push(line);
          return line;
        });
        effect$(() => log.push(summary.value));
        input.value = 'x';
        await flushSignals();
        expect(runs).toEqual(['1: ok', 'x: not a number']);
        expect(log).toEqual(['1: ok', 'x: not a number']);
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
    // Async signal tests are in async-signal.unit.tsx
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
