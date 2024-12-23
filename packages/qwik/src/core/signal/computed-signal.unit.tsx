import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import { $, type QRL } from '../shared/qrl/qrl.public';
import { invoke, newInvokeContext } from '../use/use-core';
import { ChoreType } from '../shared/scheduler';
import type { Container, HostElement } from '../shared/types';
import { Task } from '../use/use-task';
import {
  EffectProperty,
  type EffectSubscriptions,
  type InternalReadonlySignal,
  type InternalSignal,
} from './signal-types';
import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import { inlinedQrl } from '../shared/qrl/qrl';
import { isPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import { createComputedQrl, createSignal } from './signal.public';
import { createDocument, getTestPlatform } from '@qwik.dev/core/testing';
import { getDomContainer } from '../client/dom-container';

describe('signal computed', () => {
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

  ////////////////////////////////////////

  function withContainer<T>(fn: () => T): T {
    const ctx = newInvokeContext();
    ctx.$container$ = container;
    return invoke(ctx, fn);
  }

  function flushSignals() {
    return container.$scheduler$(ChoreType.WAIT_FOR_ALL);
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
