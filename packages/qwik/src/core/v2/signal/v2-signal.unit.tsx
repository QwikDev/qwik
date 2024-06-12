import { createDocument, getTestPlatform } from '@builder.io/qwik/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inlinedQrl } from '../../qrl/qrl';
import { type QRLInternal } from '../../qrl/qrl-class';
import { type QRL } from '../../qrl/qrl.public';
import type { VirtualElement } from '../../render/dom/virtual-element';
import { SubscriptionType, type Subscriber } from '../../state/common';
import { invoke, newInvokeContext } from '../../use/use-core';
import { Task } from '../../use/use-task';
import { implicit$FirstArg } from '../../util/implicit_dollar';
import { getDomContainer } from '../client/dom-container';
import { ChoreType } from '../shared/scheduler';
import type { Container2 } from '../shared/types';
import { createComputed2Qrl, createSignal2 } from './v2-signal.public';
import { isPromise } from '../../util/promises';
import { $, type ValueOrPromise } from '@builder.io/qwik';

describe('v2-signal', () => {
  const log: any[] = [];
  const delayMap = new Map();
  let container: Container2 = null!;
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
        const signal = createSignal2(123);
        expect(signal.value).toEqual(123);
      });
    });

    it('basic subscription operation', async () => {
      await withContainer(async () => {
        const signal = createSignal2(123);
        expect(signal.value).toEqual(123);
        await effect$(() => log.push(signal.value));
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
      const qrl = delay($(() => 'OK'));
      expect(qrl.resolved).not.toBeDefined();
      await qrl.resolve();
      expect(qrl.resolved).toBeDefined();
    });

    it('basic subscription operation', async () => {
      await withContainer(async () => {
        const a = createSignal2(2);
        const b = createSignal2(10);
        await retry(() => {
          const signal = createComputed2Qrl(delay($(() => a.value + b.value)));
          expect((signal as any).$untrackedValue$).toEqual(12);
          expect(signal.value).toEqual(12);
          effect$(() => log.push(signal.value));
          expect(log).toEqual([12]);
          a.value++;
          b.value += 10;
          expect(log).toEqual([12]);
        });
        await flushSignals();
        expect(log).toEqual([12, 23]);
      });
    });
  });
  ////////////////////////////////////////

  function withContainer<T>(fn: () => T): T {
    const ctx = newInvokeContext();
    ctx.$container2$ = container;
    return invoke(ctx, fn);
  }

  function flushSignals() {
    console.log('flushSignals()');
    return container.$scheduler$(ChoreType.WAIT_FOR_ALL);
  }

  /** Simulates the QRLs being lazy loaded once per test. */
  function delay<T>(qrl: QRL<() => T>): QRLInternal<() => T> {
    const iQrl = qrl as QRLInternal<() => T>;
    const hash = iQrl.$symbol$;
    let delayQrl = delayMap.get(hash);
    if (!delayQrl) {
      console.log('DELAY', hash);
      delayQrl = inlinedQrl(
        Promise.resolve(iQrl.resolve()),
        'd_' + iQrl.$symbol$,
        iQrl.$captureRef$ as any
      ) as any;
      delayMap.set(hash, delayQrl);
    }
    return delayQrl;
  }
});

async function effectQrl(fnQrl: QRL<() => void>) {
  const element: VirtualElement = null!;
  const task = new Task(0, 0, element, fnQrl as QRLInternal, undefined, null);
  const subscriber: Subscriber = [SubscriptionType.HOST, task] as any;
  const fn = (fnQrl as QRLInternal<() => void>).$resolveLazy$();
  if (isPromise(fn)) {
    throw fn;
  } else {
    const ctx = newInvokeContext();
    ctx.$subscriber$ = subscriber;
    invoke(ctx, fn);
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
