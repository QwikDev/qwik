import { describe, expect, it } from 'vitest';
import { createStore } from '../reactive-primitives/impl/store';
import { StoreFlags } from '../reactive-primitives/types';
import { _copyResourceResult, _syncResourceStore } from './use-resource';

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
