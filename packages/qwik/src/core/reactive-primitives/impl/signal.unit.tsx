import { $, _wrapProp, isBrowser } from '@qwik.dev/core';
import { createDocument, getTestPlatform } from '@qwik.dev/core/testing';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { getDomContainer } from '../../client/dom-container';
import { implicit$FirstArg } from '../../shared/qrl/implicit_dollar';
import { inlinedQrl } from '../../shared/qrl/qrl';
import { type QRLInternal } from '../../shared/qrl/qrl-class';
import { type QRL } from '../../shared/qrl/qrl.public';
import { ChoreType } from '../../shared/util-chore-type';
import type { Container, HostElement } from '../../shared/types';
import { retryOnPromise } from '../../shared/utils/promises';
import { invoke, newInvokeContext } from '../../use/use-core';
import { Task } from '../../use/use-task';
import {
  EffectProperty,
  SignalFlags,
  type InternalReadonlySignal,
  type InternalSignal,
} from '../types';
import {
  createComputed$,
  createComputedQrl,
  createSerializer$,
  createSignal,
  type ComputedSignal,
  type SerializerSignal,
  type Signal,
} from '../signal.public';
import { getSubscriber } from '../subscriber';

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
});

describe('signal', () => {
  const log: any[] = [];
  const delayMap = new Map();
  let container: Container = null!;
  beforeEach(() => {
    log.length = 0;
    const document = createDocument({ html: '<html><body q:container="paused"></body></html>' });
    container = getDomContainer(document.body);
  });

  afterEach(async () => {
    delayMap.clear();
    await container.$scheduler$(ChoreType.WAIT_FOR_QUEUE).$returnValue$;
    await getTestPlatform().flush();
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
        const a = createSignal(2) as InternalSignal<number>;
        const b = createSignal(10) as InternalSignal<number>;
        await retryOnPromise(() => {
          let signal!: InternalReadonlySignal<number>;
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
        const a = createSignal(true) as InternalSignal<boolean>;
        const b = createSignal(true) as InternalSignal<boolean>;
        await retryOnPromise(async () => {
          let signal!: InternalReadonlySignal<boolean>;
          effect$(() => {
            signal =
              signal ||
              createComputedQrl(
                delayQrl(
                  $(() => {
                    return a.value || b.value;
                  })
                )
              );
            log.push(signal.value); // causes subscription
          });
          expect(log).toEqual([true]);
          a.value = !a.untrackedValue;
          await flushSignals();
          b.value = !b.untrackedValue;
        });
        await flushSignals();
        expect(log).toEqual([true, false]);
      });
    });

    it('force', async () => {
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
        // force notify
        computed.force();
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
  });
  ////////////////////////////////////////

  function withContainer<T>(fn: () => T): T {
    const ctx = newInvokeContext();
    ctx.$container$ = container;
    return invoke(ctx, fn);
  }

  async function flushSignals() {
    await container.$scheduler$(ChoreType.WAIT_FOR_QUEUE).$returnValue$;
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
        iQrl.$captureRef$ as any
      ) as any;
      delayMap.set(hash, delayQrl);
    }
    return delayQrl;
  }

  function effectQrl(fnQrl: QRL<() => void>) {
    const qrl = fnQrl as QRLInternal<() => void>;
    const element: HostElement = null!;
    const task = new Task(0, 0, element, fnQrl as QRLInternal, undefined, null);
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
