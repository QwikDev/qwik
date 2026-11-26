import { getDomContainer, implicit$FirstArg, type QRL } from '@qwik.dev/core';
import { createDocument } from '@qwik.dev/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Container, HostElement } from '../../shared/types';
import { getOrCreateStore, isStore } from './store';
import { EffectProperty, StoreFlags } from '../types';
import { invoke } from '../../use/use-core';
import { newInvokeContext } from '../../use/use-core';
import type { QRLInternal } from '../../shared/qrl/qrl-class';
import { Task, TaskFlags } from '../../use/use-task';
import { getSubscriber } from '../subscriber';
import { createComputed$ } from '../signal.public';
import { vnode_newVirtual, vnode_setProp } from '../../client/vnode-utils';
import { ELEMENT_SEQ } from 'packages/qwik/src/server/qwik-copy';

describe('v2/store', () => {
  const log: any[] = [];
  let container: Container = null!;
  let document: Document = null!;
  beforeEach(() => {
    log.length = 0;
    document = createDocument({
      html: '<html><body q:container="paused"></body></html>',
    });
    container = getDomContainer(document.body);
  });

  afterEach(async () => {
    await container.$renderPromise$;
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

  it('should notify when an array index is deleted', async () => {
    await withContainer(async () => {
      const store = getOrCreateStore([1, 2], StoreFlags.NONE, container);
      effect$(() => log.push(store.join(',')));
      expect(log).toEqual(['1,2']);
      delete store[0];
      await flushSignals();
      expect(log).toEqual(['1,2', ',2']);
    });
  });

  it('should notify once when the last array index is deleted', async () => {
    await withContainer(() => {
      const store = getOrCreateStore([1, 2, 3], StoreFlags.NONE, container);
      const { calls, value } = watchArray(store);

      delete store[2];

      expect(calls.count).toBe(1);
      expect(value.value).toBe('1,2,');
    });
  });

  it('should notify once when an array is popped', async () => {
    await withContainer(() => {
      const store = getOrCreateStore([1, 2, 3], StoreFlags.NONE, container);
      const { calls, value } = watchArray(store);

      store.pop();

      expect(calls.count).toBe(1);
      expect(value.value).toBe('1,2');
    });
  });

  it('should preserve a retrieved array method when called later', async () => {
    await withContainer(async () => {
      const store = getOrCreateStore([1, 2, 3], StoreFlags.NONE, container);
      const { calls, value } = watchArray(store);
      const pop = store.pop;

      expect(pop).toBe(store.pop);
      await Promise.resolve();
      Reflect.apply(pop, store, []);

      expect(calls.count).toBe(1);
      expect(value.value).toBe('1,2');
    });
  });

  it('should notify once for each reentrant array method call', async () => {
    await withContainer(() => {
      const store = getOrCreateStore([1, 2, 3], StoreFlags.NONE, container);
      const { calls, value } = watchArray(store);

      Reflect.apply(store.splice, store, [0, { valueOf: () => store.pop() && 1 }]);

      expect(calls.count).toBe(2);
      expect(value.value).toBe('2,');
    });
  });

  it('should notify once when an array item is spliced out', async () => {
    await withContainer(() => {
      const store = getOrCreateStore([1, 2, 3], StoreFlags.NONE, container);
      const { calls, value } = watchArray(store);

      store.splice(0, 1);

      expect(calls.count).toBe(1);
      expect(value.value).toBe('2,3');
    });
  });

  it('should notify once when an array item is spliced in', async () => {
    await withContainer(() => {
      const store = getOrCreateStore([1, 2, 3], StoreFlags.NONE, container);
      const { calls, value } = watchArray(store);

      store.splice(1, 0, 9);

      expect(calls.count).toBe(1);
      expect(value.value).toBe('1,9,2,3');
    });
  });

  it('should notify once when an array is shifted', async () => {
    await withContainer(() => {
      const store = getOrCreateStore([1, 2, 3], StoreFlags.NONE, container);
      const { calls, value } = watchArray(store);

      store.shift();

      expect(calls.count).toBe(1);
      expect(value.value).toBe('2,3');
    });
  });

  it('should update a derived array value synchronously after deletion', async () => {
    await withContainer(() => {
      const store = getOrCreateStore([1, 2, 3], StoreFlags.NONE, container);
      const { calls, value } = watchArray(store);

      delete store[1];

      expect(value.value).toBe('1,,3');
      expect(calls.count).toBe(1);
    });
  });

  it('should not notify when an array method does not change the array', async () => {
    await withContainer(() => {
      const store = getOrCreateStore<number[]>([], StoreFlags.NONE, container);
      const { calls, value } = watchArray(store);

      store.pop();
      store.splice(0, 0);

      expect(calls.count).toBe(0);
      expect(value.value).toBe('');
    });
  });

  it('should coalesce mutations independently for nested array stores', async () => {
    await withContainer(() => {
      const store = getOrCreateStore([[1, 2], [3]], StoreFlags.RECURSIVE, container);
      const calls = { count: 0 };
      const value = createComputed$(() => {
        calls.count++;
        return store.map((items) => items.join(',')).join(';');
      });
      effect$(() => value.value);
      expect(calls.count).toBe(1);
      calls.count = 0;

      store[0].pop();

      expect(calls.count).toBe(1);
      expect(value.value).toBe('1;3');
    });
  });

  function withContainer<T>(fn: () => T): T {
    const ctx = newInvokeContext();
    ctx.$container$ = container;
    return invoke(ctx, fn);
  }

  async function flushSignals() {
    await container.$renderPromise$;
  }

  function watchArray(store: number[]) {
    const calls = { count: 0 };
    const value = createComputed$(() => {
      calls.count++;
      return store.join(',');
    });
    effect$(() => value.value);
    expect(calls.count).toBe(1);
    calls.count = 0;
    return { calls, value };
  }

  function effectQrl(fnQrl: QRL<() => void>) {
    const qrl = fnQrl as QRLInternal<() => void>;
    const element: HostElement = vnode_newVirtual();
    const task = new Task(TaskFlags.TASK, 0, element, fnQrl as QRLInternal, null);
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
