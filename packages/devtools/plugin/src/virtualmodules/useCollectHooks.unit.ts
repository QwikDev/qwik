import { runInThisContext } from 'node:vm';
import { describe, expect, test } from 'vitest';
import useCollectHooks, { __qwik_is_serializable_hook_value__ } from './useCollectHooks';

class Reactive {}
const isReactive = (value: unknown) => value instanceof Reactive;
const isSerializable = (value: unknown) => __qwik_is_serializable_hook_value__(value, isReactive);
const qrl = Object.assign(() => {}, { getSymbol: () => 's_abc' });

describe('__qwik_is_serializable_hook_value__', () => {
  test('accepts primitives, reactive values and QRLs', () => {
    for (const value of ['text', 1, true, null, undefined, 1n, new Reactive(), qrl]) {
      expect(isSerializable(value)).toBe(true);
    }
  });

  test('accepts plain objects and arrays of serializable values, including cycles', () => {
    const cyclic: Record<string, unknown> = { qrl };
    cyclic.self = cyclic;
    expect(isSerializable({ state: new Reactive(), items: [1, 'a', [qrl]] })).toBe(true);
    expect(isSerializable(cyclic)).toBe(true);
  });

  test('rejects plain functions, symbols, class instances and sparse arrays', () => {
    for (const value of [() => 'label', Symbol('s'), new Intl.NumberFormat(), new Array(1)]) {
      expect(isSerializable(value)).toBe(false);
    }
  });

  test('rejects plain objects and arrays holding a non-serializable value', () => {
    expect(isSerializable({ t: (key: string) => key })).toBe(false);
    expect(isSerializable([new Reactive(), new Map()])).toBe(false);
  });

  test('stays self-contained when emitted into the collector module', () => {
    const source = String(__qwik_is_serializable_hook_value__);
    const emitted = runInThisContext(`(${source})`);
    expect(useCollectHooks).toContain(source);
    expect(emitted({ items: [1, qrl] }, isReactive)).toBe(true);
    expect(emitted({ t: () => 'label' }, isReactive)).toBe(false);
  });
});
