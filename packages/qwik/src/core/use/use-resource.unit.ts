import { describe, expect, it } from 'vitest';
import { createStore } from '../reactive-primitives/impl/store';
import { StoreFlags } from '../reactive-primitives/types';
import { createAsyncQrl } from '../reactive-primitives/signal.public';
import type { AsyncSignalImpl } from '../reactive-primitives/impl/async-signal-impl';
import { createQRL } from '../shared/qrl/qrl-class';
import { _rsc, _copyResourceResult, _syncResourceStore } from './use-resource';

describe('use-resource store sync', () => {
  it('replaces existing array indices with holes without changing next', () => {
    const current = createStore(null, [1, 2, 3], StoreFlags.RECURSIVE);
    const next = [1].concat(new Array<number>(1), [3]);
    _syncResourceStore(current, next);
    expect(current).toEqual(next);
    expect(Object.hasOwn(current, 1)).toBe(false);
    expect(next).toEqual([1].concat(new Array<number>(1), [3]));
  });

  it.each([false, true])('syncs symbol keys from a store proxy: %s', (proxy) => {
    const removed = Symbol('removed');
    const updated = Symbol('updated');
    const added = Symbol('added');
    const current = createStore(null, { [removed]: 1, [updated]: 2 }, StoreFlags.RECURSIVE);
    const source = { [updated]: 3, [added]: 4 };
    const next = proxy ? createStore(null, source, StoreFlags.RECURSIVE) : source;
    _syncResourceStore(current, next);
    expect(current).toEqual(source);
    expect(Object.hasOwn(current, removed)).toBe(false);
    expect(source).toEqual({ [updated]: 3, [added]: 4 });
    expect(Reflect.ownKeys(next)).toEqual([updated, added]);
  });

  it('drops keys missing from the next plain object result', () => {
    const current = createStore(null, { name: 'Case A', featured: true }, StoreFlags.RECURSIVE);
    _syncResourceStore(current, { name: 'Case B' });
    expect(current).toEqual({ name: 'Case B' });
  });

  it('drops keys missing when the next result is a store proxy', () => {
    const current = createStore(null, { name: 'Case A', featured: true }, StoreFlags.RECURSIVE);
    const next = createStore(null, { name: 'Case B' }, StoreFlags.RECURSIVE);
    _syncResourceStore(current, next);
    expect(current).toEqual({ name: 'Case B' });
  });
});

describe('copyResourceResult', () => {
  it('keeps own __proto__ as data without polluting the prototype', () => {
    const input = JSON.parse('{"keep":1,"__proto__":{"polluted":true}}') as object;
    const copy = _copyResourceResult(input);
    expect(Object.hasOwn(copy, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
    expect((copy as { polluted?: boolean }).polluted).toBeUndefined();
    expect((copy as { keep: number }).keep).toBe(1);
  });

  it('preserves enumerable symbol keys from the source object', () => {
    const symbolKey = Symbol('tag');
    const input = { value: 1, [symbolKey]: 'ok' };
    const copy = _copyResourceResult(input);
    expect(Reflect.get(copy, symbolKey)).toBe('ok');
  });
});

describe('resource result ownership', () => {
  it.each([{ old: 1 }, [1], 1])('ignores an old completion: %j', async (oldResult) => {
    const original = structuredClone(oldResult);
    const ref = {} as { r: unknown };
    const pending: ((value: unknown) => void)[] = [];
    const fn = createQRL(null, 'result', () => new Promise((resolve) => pending.push(resolve)));
    const wrapped = createQRL(null, '_rsc', _rsc, null, [fn, ref]);
    const signal = createAsyncQrl(wrapped as any, { concurrency: 0 }) as AsyncSignalImpl<{
      r: unknown;
    }>;
    signal.$computeIfNeeded$();
    const older = signal.$current$!.$promise$;
    signal.invalidate();
    signal.$computeIfNeeded$();
    const newer = signal.$current$!.$promise$;
    const fresh = { fresh: 2 };
    pending[1](fresh);
    await newer;
    const accepted = signal.value.r;
    pending[0](oldResult);
    await older;
    expect(signal.value.r).toBe(accepted);
    expect(ref.r).toBe(accepted);
    expect(accepted).toEqual({ fresh: 2 });
    expect(fresh).toEqual({ fresh: 2 });
    expect(oldResult).toEqual(original);
  });

  it.each([undefined, { previous: true }])(
    'copies array properties on initial or changed shape: %j',
    async (initial) => {
      const tag = Symbol('tag');
      const input = Object.assign(new Array<number>(3), { 1: 7, label: 'array', [tag]: 'kept' });
      Object.freeze(input);
      const ref = { r: initial };
      const fn = createQRL(null, 'result', () => input);
      const wrapped = createQRL(null, '_rsc', _rsc, null, [fn, ref]);
      const signal = createAsyncQrl(wrapped as any) as AsyncSignalImpl<{ r: typeof input }>;
      await signal.promise();
      const result = signal.value.r;
      expect(result).not.toBe(input);
      expect(result.length).toBe(3);
      expect(Object.hasOwn(result, 0)).toBe(false);
      expect(Object.hasOwn(result, 2)).toBe(false);
      expect(result[1]).toBe(7);
      expect(result[tag]).toBe('kept');
      expect(result.label).toBe('array');
      expect(Reflect.ownKeys(result)).toEqual(Reflect.ownKeys(input));
      expect(input).toEqual(
        Object.assign(new Array<number>(3), { 1: 7, label: 'array', [tag]: 'kept' })
      );
    }
  );
});
