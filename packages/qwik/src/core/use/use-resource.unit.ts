import { describe, expect, it } from 'vitest';
import { createStore, unwrapStore } from '../reactive-primitives/impl/store';
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

  it('removes fields that become non-enumerable in the next result', () => {
    const current = createStore(null, { hidden: 'old' }, StoreFlags.RECURSIVE);
    const next = Object.defineProperty({}, 'hidden', { value: 'new' });
    _syncResourceStore(current, next);
    expect(unwrapStore(current)).toEqual({});
    expect(Object.getOwnPropertyDescriptor(next, 'hidden')?.value).toBe('new');
  });

  it('creates own data fields even when equal to inherited properties', () => {
    const current = createStore(null, {}, StoreFlags.RECURSIVE);
    _syncResourceStore(current, { constructor: Object });
    expect(Object.hasOwn(unwrapStore(current), 'constructor')).toBe(true);
    expect(unwrapStore(current).constructor).toBe(Object);
  });

  it('leaves the current result intact if reading next fails', () => {
    const current = createStore(null, { keep: 1 }, StoreFlags.RECURSIVE);
    const next = Object.defineProperty({}, 'value', {
      enumerable: true,
      get() {
        throw new Error('read failed');
      },
    });
    expect(() => _syncResourceStore(current, next)).toThrow('read failed');
    expect(current).toEqual({ keep: 1 });
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

  it('copies array data once without invoking its own slice property', () => {
    const reads = { count: 0 };
    const input = Object.assign(new Array<number>(3), { slice: 'data' });
    Object.defineProperty(input, 1, {
      enumerable: true,
      get() {
        reads.count++;
        return 7;
      },
    });
    const copy = _copyResourceResult(input);
    expect(copy).toHaveLength(3);
    expect(Object.hasOwn(copy, 0)).toBe(false);
    expect(copy[1]).toBe(7);
    expect(Object.hasOwn(copy, 2)).toBe(false);
    expect(Reflect.get(copy, 'slice')).toBe('data');
    expect(reads.count).toBe(1);
  });

  it('preserves enumerable symbol keys from the source object', () => {
    const symbolKey = Symbol('tag');
    const input = { value: 1, [symbolKey]: 'ok' };
    const copy = _copyResourceResult(input);
    expect(Reflect.get(copy, symbolKey)).toBe('ok');
  });
});

describe('resource result ownership', () => {
  describe.each([true, false])('newer run settles before resolving older: %s', (waitForNewer) => {
    it.each([{ old: 1 }, [1], 1])('ignores an old completion: %j', async (oldResult) => {
      const original = structuredClone(oldResult);
      const accepted = createStore(null, { seed: 0 }, StoreFlags.RECURSIVE);
      const ref = { r: accepted };
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
      // Let both QRL calls attach to their pending promises.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      const fresh = { fresh: 2 };
      pending[1](fresh);
      if (waitForNewer) {
        await newer;
      }
      pending[0](oldResult);
      await Promise.all([newer, older]);
      expect(signal.value.r).toBe(accepted);
      expect(ref.r).toBe(accepted);
      expect(accepted).toEqual({ fresh: 2 });
      expect(fresh).toEqual({ fresh: 2 });
      expect(oldResult).toEqual(original);
    });
  });

  it.each(['dispose', 'manual value'])(
    'does not commit pending resource results after %s',
    async (cancel) => {
      const retained = createStore(null, { keep: 1 }, StoreFlags.RECURSIVE);
      const ref = { r: retained };
      const pending: ((value: unknown) => void)[] = [];
      const fn = createQRL(null, 'result', () => new Promise((resolve) => pending.push(resolve)));
      const wrapped = createQRL(null, '_rsc', _rsc, null, [fn, ref]);
      const signal = createAsyncQrl(wrapped as any, { concurrency: 0 }) as AsyncSignalImpl<{
        r: unknown;
      }>;
      signal.$computeIfNeeded$();
      const running = signal.$current$!.$promise$;
      if (cancel === 'dispose') {
        signal.$dispose();
      } else {
        signal.value = { r: 'manual' };
      }
      const result = { stale: 2 };
      pending[0](result);
      await running;
      expect(ref.r).toBe(retained);
      expect(retained).toEqual({ keep: 1 });
      expect(result).toEqual({ stale: 2 });
      if (cancel === 'manual value') {
        expect(signal.value.r).toBe('manual');
      }
    }
  );

  it('honors cancellation triggered while reading a result getter', async () => {
    const retained = createStore(null, { keep: 1 }, StoreFlags.RECURSIVE);
    const ref = { r: retained };
    const input = Object.defineProperty({}, 'value', {
      enumerable: true,
      get() {
        signal.value = { r: 'manual' };
        return 2;
      },
    });
    const fn = createQRL(null, 'result', () => input);
    const wrapped = createQRL(null, '_rsc', _rsc, null, [fn, ref]);
    const signal = createAsyncQrl(wrapped as any) as AsyncSignalImpl<{ r: unknown }>;
    await signal.promise();
    expect(signal.value.r).toBe('manual');
    expect(ref.r).toBe(retained);
    expect(retained).toEqual({ keep: 1 });
  });

  it('reports commit read errors without changing the retained result', async () => {
    const retained = createStore(null, { keep: 1 }, StoreFlags.RECURSIVE);
    const ref = { r: retained };
    const error = new Error('read failed');
    const input = Object.defineProperty({}, 'value', {
      enumerable: true,
      get() {
        throw error;
      },
    });
    const fn = createQRL(null, 'result', () => input);
    const wrapped = createQRL(null, '_rsc', _rsc, null, [fn, ref]);
    const signal = createAsyncQrl(wrapped as any) as AsyncSignalImpl<{ r: unknown }>;
    await signal.promise();
    expect(signal.error).toBe(error);
    expect(ref.r).toBe(retained);
    expect(retained).toEqual({ keep: 1 });
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
