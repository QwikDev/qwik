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
import { vnode_newVirtual, vnode_setProp } from '../../client/vnode-utils';
import { _syncResourceStore } from '../../use/use-resource';
import { ELEMENT_SEQ } from 'packages/qwik/src/server/qwik-copy';

describe('v2/store', () => {
  const log: any[] = [];
  let container: Container = null!;
  let document: Document = null!;
  beforeEach(() => {
    log.length = 0;
    document = createDocument({ html: '<html><body q:container="paused"></body></html>' });
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

  it.each(['add', 'update', 'unchanged', 'remove'])(
    'notifies store-only __proto__ readers: %s',
    async (change) => {
      await withContainer(async () => {
        const input = change === 'add' ? {} : JSON.parse('{"__proto__":"before"}');
        const store = getOrCreateStore<any>(input, StoreFlags.RECURSIVE, container);
        const values: string[] = [];
        effect$(() => {
          values.push(typeof store.__proto__ === 'object' ? 'prototype' : String(store.__proto__));
        });
        const initial = change === 'add' ? 'prototype' : 'before';
        const next =
          change === 'remove'
            ? {}
            : JSON.parse(
                change === 'unchanged' ? '{"__proto__":"before"}' : '{"__proto__":"after"}'
              );
        _syncResourceStore(store, next);
        await flushSignals();
        const updated = change === 'remove' ? 'prototype' : 'after';
        expect(values).toEqual(change === 'unchanged' ? [initial] : [initial, updated]);
        expect(Object.getPrototypeOf(input)).toBe(Object.prototype);
        expect(Object.hasOwn(input, '__proto__')).toBe(change !== 'remove');
        expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
      });
    }
  );

  it.each(['add', 'update', 'unchanged', 'remove'])(
    'notifies symbol enumeration readers: %s',
    async (change) => {
      await withContainer(async () => {
        const tag = Symbol('tag');
        const store = getOrCreateStore<any>(
          change === 'add' ? {} : { [tag]: 'before' },
          StoreFlags.RECURSIVE,
          container
        );
        const values: string[] = [];
        effect$(() => {
          values.push(
            Reflect.ownKeys(store)
              .map((key) => String(store[key]))
              .join(',')
          );
        });
        const initial = change === 'add' ? '' : 'before';
        const next =
          change === 'remove' ? {} : { [tag]: change === 'unchanged' ? 'before' : 'after' };
        _syncResourceStore(store, next);
        await flushSignals();
        const updated = change === 'remove' ? '' : 'after';
        expect(values).toEqual(change === 'unchanged' ? [initial] : [initial, updated]);
      });
    }
  );

  function withContainer<T>(fn: () => T): T {
    const ctx = newInvokeContext();
    ctx.$container$ = container;
    return invoke(ctx, fn);
  }

  async function flushSignals() {
    await container.$renderPromise$;
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
