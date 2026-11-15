import { describe, expect, it } from 'vitest';
import { createSerializationContext } from '../../../serializer';
import type { DeserializeContainer } from '../types';
import { BinaryCode, BinaryStateReader, isBinaryState } from './binary-state';
import { TypeIds } from './constants';
import { SERIALIZER_PROXY_UNWRAP, wrapBinaryStateProxy } from './deser-proxy';

const serialize = (...roots: unknown[]): Promise<string> => {
  const context = createSerializationContext(
    null,
    null,
    () => '',
    () => {},
    new WeakMap<any, any>()
  );
  for (let i = 0; i < roots.length; i++) {
    context.$addRoot$(roots[i]);
  }
  return context.$serializeBinary$();
};

const restore = (stateScript: string): unknown[] => {
  const reader = new BinaryStateReader(stateScript);
  const container: DeserializeContainer = {
    $getObjectById$: (id) => state[Number(id)],
    $getForwardRef$: (id) => reader.$forwardRefs$?.[id],
    getSyncFn: () => () => {},
    $storeProxyMap$: new WeakMap(),
    element: null,
    $forwardRefs$: reader.$forwardRefs$,
  };
  const state = wrapBinaryStateProxy(container as any, reader);
  return state;
};

const roundTrip = async (...roots: unknown[]) => restore(await serialize(...roots));

describe('binary state', () => {
  it('is told apart from JSON state by its first character', async () => {
    expect(isBinaryState('[0,1]')).toBe(false);
    expect(isBinaryState(await serialize(1))).toBe(true);
  });

  it('has room for every type id below the short integer codes', () => {
    expect(BinaryCode.Type0 + TypeIds.EffectSubscriptionNoData).toBeLessThan(BinaryCode.Num0);
  });

  it('restores integers of every size', async () => {
    const magnitudes = [0, 17, 18, 127, 128, 16383, 16384, 2 ** 28 - 1, 2 ** 28, 1.7e12, 2 ** 42];
    const integers = [...magnitudes, ...magnitudes.slice(1).map((n) => -n)];
    expect(Array.from(await roundTrip(integers))[0]).toEqual(integers);
  });

  it('restores decimals and floats exactly', async () => {
    const numbers = [88.13, -0.5, 2467.6400000000003, 1e-7, Math.PI, 0.1 + 0.2, 1e300, -1e21];
    expect(Array.from(await roundTrip(numbers))[0]).toEqual(numbers);
  });

  it('restores more strings than fit a one-unit index', async () => {
    const strings = Array.from({ length: 20000 }, (_, i) => 'string ' + i);
    expect(Array.from(await roundTrip(strings))[0]).toEqual(strings);
  });

  it('restores nested objects, arrays and built-in types', async () => {
    const value = {
      list: [null, [], {}, undefined, true, 'x'],
      when: new Date(1700000000000),
      url: new URL('http://localhost/'),
      big: 123456789012345678901234567890n,
      map: new Map<unknown, unknown>([['a', { b: 1 }]]),
      set: new Set([1, 'two', [3]]),
      long: Array.from({ length: 20 }, (_, i) => ({ i })),
    };
    expect(Array.from(await roundTrip(value))[0]).toEqual(value);
  });

  it('keeps the order of object keys', async () => {
    const [object] = await roundTrip({ z: 1, a: 2, m: 3 });
    expect(Object.keys(object as object)).toEqual(['z', 'a', 'm']);
  });

  it('restores a value referenced twice as one object', async () => {
    const shared = { name: 'shared' };
    const [first, second] = (await roundTrip({ shared }, { again: shared })) as any[];
    expect(first.shared).toEqual(shared);
    expect(second.again).toBe(first.shared);
  });

  it('restores a shared value first reached through its second reference', async () => {
    const shared = { name: 'shared' };
    const state = (await roundTrip({ shared }, { again: shared })) as any[];
    const again = state[1].again;
    expect(state[0].shared).toBe(again);
  });

  it('restores an object that refers to itself', async () => {
    const parent: any = { child: { name: 'child' } };
    parent.child.parent = parent;
    parent.self = parent;
    const [restored] = (await roundTrip(parent)) as any[];
    expect(restored.self).toBe(restored);
    expect(restored.child.parent).toBe(restored);
  });

  it('restores a resolved promise', async () => {
    const [promise] = await roundTrip(Promise.resolve({ done: true }));
    await expect(promise).resolves.toEqual({ done: true });
  });

  it('keeps untouched roots unrestored while most of the state is unread', async () => {
    const big = Array.from({ length: 100 }, (_, i) => ({ i }));
    const state = await roundTrip({ small: 1 }, big);
    state[0];
    expect((state as any)[SERIALIZER_PROXY_UNWRAP][1]).toBeUndefined();
  });

  it('restores the remaining roots once 90% of the state is restored', async () => {
    const big = Array.from({ length: 100 }, (_, i) => ({ i }));
    const state = await roundTrip({ small: 1 }, big);
    state[1];
    expect((state as any)[SERIALIZER_PROXY_UNWRAP][0]).toEqual({ small: 1 });
    expect(state[0]).toBe((state as any)[SERIALIZER_PROXY_UNWRAP][0]);
    expect(state.length).toBe(2);
  });

  it('writes nothing that could end or alter the script element', async () => {
    const values = Array.from({ length: 5000 }, (_, i) => [i, '</script><!--' + i, i / 7]);
    const script = await serialize(values);
    expect(script).not.toMatch(/[<\0\r]/);
    expect(Array.from(restore(script))[0]).toEqual(values);
  });

  it('rejects an item count larger than the units that hold the items', async () => {
    const script = await serialize(Array.from({ length: 20 }, (_, i) => i));
    // the root list is [..., Items0, count 1, ArrayEnd]; claim 17 roots instead
    const tampered =
      script.slice(0, -2) + String.fromCharCode(BinaryCode.Num0 + 17) + script.slice(-1);
    expect(() => new BinaryStateReader(tampered)).toThrow();
  });
});
