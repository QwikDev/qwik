import { createDocument, getTestPlatform } from '@qwik.dev/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDomContainer } from '../client/dom-container';
import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import { type QRLInternal } from '../shared/qrl/qrl-class';
import { type QRL } from '../shared/qrl/qrl.public';
import { ChoreType } from '../shared/scheduler';
import type { Container, HostElement } from '../shared/types';
import { invoke, newInvokeContext } from '../use/use-core';
import { Task } from '../use/use-task';
import {} from './signal';
import { createSignal } from './signal.public';
import { EffectProperty, type EffectSubscriptions } from './signal-types';

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
});
