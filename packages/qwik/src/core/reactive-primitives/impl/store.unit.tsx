import { getDomContainer, implicit$FirstArg, type QRL } from '@qwik.dev/core';
import { createDocument, getTestPlatform } from '@qwik.dev/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Container, HostElement } from '../../shared/types';
import { getOrCreateStore, isStore } from './store';
import { EffectProperty, StoreFlags } from '../types';
import { invoke } from '../../use/use-core';
import { newInvokeContext } from '../../use/use-core';
import { ChoreType } from '../../shared/util-chore-type';
import type { QRLInternal } from '../../shared/qrl/qrl-class';
import { Task } from '../../use/use-task';
import { getSubscriber } from '../subscriber';

describe('v2/store', () => {
  const log: any[] = [];
  let container: Container = null!;
  beforeEach(() => {
    log.length = 0;
    const document = createDocument({ html: '<html><body q:container="paused"></body></html>' });
    container = getDomContainer(document.body);
  });

  afterEach(async () => {
    await container.$scheduler$(ChoreType.WAIT_FOR_QUEUE).$returnValue$;
    await getTestPlatform().flush();
    container = null!;
  });

  it('should create and toString', () => {
    const store = getOrCreateStore({ name: 'foo' }, StoreFlags.NONE, container);
    expect(isStore({})).toEqual(false);
    expect(isStore(store)).toEqual(true);
    expect(store.toString()).toEqual('[Store]');
  });
  it('should respond to instanceof', () => {
    const target = { name: 'foo' };
    Object.freeze(target);
    const store = getOrCreateStore(target, StoreFlags.NONE, container);
    expect(store instanceof Array).toEqual(false);
    expect(target instanceof Object).toEqual(true);
  });

  it('should subscribe when `prop in store` is used', async () => {
    await withContainer(async () => {
      const store = getOrCreateStore<any>({}, StoreFlags.NONE, container);
      const log: string[] = [];
      effect$(() => {
        log.push(`${'bar' in store}`);
      });
      expect(log).toEqual(['false']);
      store.bar = 'baz';
      await flushSignals();
      expect(log).toEqual(['false', 'true']);
    });
  });

  function withContainer<T>(fn: () => T): T {
    const ctx = newInvokeContext();
    ctx.$container$ = container;
    return invoke(ctx, fn);
  }

  async function flushSignals() {
    await container.$scheduler$(ChoreType.WAIT_FOR_QUEUE).$returnValue$;
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
