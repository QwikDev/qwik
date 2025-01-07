import { $, SerializerSymbol, type ValueOrPromise } from '@qwik.dev/core';
import { createDocument, getTestPlatform } from '@qwik.dev/core/testing';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { getDomContainer } from '../client/dom-container';
import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import { inlinedQrl } from '../shared/qrl/qrl';
import { type QRLInternal } from '../shared/qrl/qrl-class';
import { type QRL } from '../shared/qrl/qrl.public';
import { ChoreType } from '../shared/scheduler';
import type { Container, HostElement } from '../shared/types';
import { isPromise } from '../shared/utils/promises';
import { invoke, newInvokeContext } from '../use/use-core';
import { Task } from '../use/use-task';
import {
  EffectProperty,
  type EffectSubscriptions,
  type InternalReadonlySignal,
  type InternalSignal,
} from './signal';
import {
  createComputedQrl,
  createSignal,
  type Signal,
  type ComputedSignal,
  type SerializedSignal,
  createComputed$,
  createSerialized$,
} from './signal.public';

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
  it('SerializedSignal<T>', () => () => {
    class Foo {
      [SerializerSymbol]() {
        return 1;
      }
    }
    {
      const signal = createSerialized$(() => new Foo());
      expectTypeOf(signal).toEqualTypeOf<SerializedSignal<Foo>>();
      expectTypeOf(signal.value).toEqualTypeOf<Foo>();
    }
    {
      const signal = createSerialized$((prev) => {
        // sadly we can't do better here
        expectTypeOf(prev).toBeUnknown();
        return new Foo();
      });
      expectTypeOf(signal).toEqualTypeOf<SerializedSignal<Foo>>();
      expectTypeOf(signal.value).toEqualTypeOf<Foo>();
    }
    {
      const signal = createSerialized$((prev?: number | Foo) => {
        expectTypeOf(prev).toEqualTypeOf<number | Foo | undefined>();
        return new Foo();
      });
      expectTypeOf(signal).toEqualTypeOf<SerializedSignal<Foo>>();
      expectTypeOf(signal.value).toEqualTypeOf<Foo>();
    }
    {
      const signal = createSerialized$<Foo, number>((prev) => {
        expectTypeOf(prev).toEqualTypeOf<number | undefined>();
        return new Foo();
      });
      expectTypeOf(signal).toEqualTypeOf<SerializedSignal<Foo>>();
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
    await container.$scheduler$(ChoreType.WAIT_FOR_ALL);
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
        await retry(() => {
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
    // using .only because otherwise there's a function-not-the-same issue
    it('force', () =>
      withContainer(async () => {
        const obj = { count: 0 };
        const computed = await retry(() => {
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
        (computed as any).$invalid$ = true;
        computed.value.count;
        await flushSignals();
        expect(log).toEqual([1]);
        expect(obj.count).toBe(2);
        // force recalculation+notify
        computed.force();
        await flushSignals();
        expect(log).toEqual([1, 3]);
      }));
  });
  ////////////////////////////////////////

  function withContainer<T>(fn: () => T): T {
    const ctx = newInvokeContext();
    ctx.$container$ = container;
    return invoke(ctx, fn);
  }

  function flushSignals() {
    return container.$scheduler$(ChoreType.WAIT_FOR_ALL);
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
      const subscriber: EffectSubscriptions = [task, EffectProperty.COMPONENT, ctx];
      ctx.$effectSubscriber$ = subscriber;
      return invoke(ctx, qrl.getFn(ctx));
    }
  }

  const effect$ = /*#__PURE__*/ implicit$FirstArg(effectQrl);

  function retry<T>(fn: () => T): ValueOrPromise<T> {
    try {
      return fn();
    } catch (e) {
      if (isPromise(e)) {
        return e.then(retry.bind(null, fn)) as ValueOrPromise<T>;
      }
      throw e;
    }
  }
});
