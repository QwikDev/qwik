import { createComputed$, createSignal, noSerialize, SerializerSymbol } from '@qwik.dev/core';
import { describe, expect, it, vi } from 'vitest';
import { _serialize, createSerializationContext } from '../../../serializer';
import { createStringStreamWriter } from '../../ssr/stream-writer';
import type { ComputedSignalImpl } from '../../reactive-primitives/impl/computed-signal-impl';
import { createStore, StoreHandler } from '../../reactive-primitives/impl/store';
import {
  AsyncSignalFlags,
  ComputedSignalFlags,
  NEEDS_COMPUTATION,
  StoreFlags,
} from '../../reactive-primitives/types';
import { _createDeserializeContainer, _deserialize } from './serdes.public';

const readyComputed = <T>(value: T, async = false) => {
  const signal = createComputed$(() => null, {
    serializationStrategy: 'auto',
  }) as unknown as ComputedSignalImpl<T>;
  signal.value = value;
  if (async) {
    signal.$flags$ |= AsyncSignalFlags.ASYNC_MODE;
  }
  return signal;
};

const roundTrip = async <T>(value: T) => _deserialize<T>(await _serialize(value));

describe('auto serialization', () => {
  it.each([false, true])(
    'restores small values without computing again (async=%s)',
    async (async) => {
      const values = [undefined, null, false, 0, NaN, Infinity, 42n, 'hello', { id: 1 }, [1, 2]];
      for (let i = 0; i < values.length; i++) {
        const value = values[i];
        const signal = await roundTrip(readyComputed(value, async));
        expect(signal.$flags$ & ComputedSignalFlags.INVALID).toBe(0);
        expect(signal.value).toEqual(value);
      }
    }
  );

  it.each([false, true])('omits a large unshared value (async=%s)', async (async) => {
    const value = { text: 'large-result'.repeat(10000) };
    const raw = await _serialize(readyComputed(value, async));
    expect(raw.length).toBeLessThan(1000);
    const signal = await _deserialize<ComputedSignalImpl<unknown>>(raw);
    expect(signal.$untrackedValue$).toBe(NEEDS_COMPUTATION);
    expect(signal.$flags$ & ComputedSignalFlags.INVALID).toBeTruthy();
  });

  it.each([false, true])(
    'reuses a strongly referenced value in either order (first=%s)',
    async (first) => {
      const value = { text: 'shared-value'.repeat(10000) };
      const signal = readyComputed(value);
      const roots = first ? [signal, { nested: value }] : [{ nested: value }, signal];
      const restored = await roundTrip(roots);
      const computed = restored[first ? 0 : 1] as ComputedSignalImpl<typeof value>;
      const holder = restored[first ? 1 : 0] as { nested: typeof value };
      expect(computed.value).toBe(holder.nested);
      expect(computed.value.text).toBe(value.text);
    }
  );

  it('does not make auto references keep each other alive', async () => {
    const value = { text: 'unshared-value'.repeat(10000) };
    const raw = await _serialize([readyComputed(value), readyComputed(value)]);
    expect(raw.length).toBeLessThan(1000);
    const restored = await _deserialize<ComputedSignalImpl<unknown>[]>(raw);
    expect(restored.map((signal) => signal.$untrackedValue$)).toEqual([
      NEEDS_COMPUTATION,
      NEEDS_COMPUTATION,
    ]);
  });

  it('does not traverse an oversized array', async () => {
    const value = new Array(1000000);
    const getter = vi.fn(() => {
      throw new Error('must not read array entries');
    });
    Object.defineProperty(value, '0', { enumerable: true, get: getter });
    const signal = await roundTrip(readyComputed(value));
    expect(signal.$untrackedValue$).toBe(NEEDS_COMPUTATION);
    expect(getter).not.toHaveBeenCalled();
  });

  it('does not evaluate getters while deciding whether to retain a result', async () => {
    const getter = vi.fn(() => {
      throw new Error('must not evaluate getters');
    });
    const value = Object.defineProperty({}, 'name', { enumerable: true, get: getter });
    const signal = await roundTrip(readyComputed(value));
    expect(signal.$untrackedValue$).toBe(NEEDS_COMPUTATION);
    expect(getter).not.toHaveBeenCalled();
  });

  it('does not run custom serializers just to estimate a value', async () => {
    const serializer = vi.fn(() => 'custom value');
    const value = { [SerializerSymbol]: serializer };
    const signal = await roundTrip(readyComputed(value));
    expect(signal.$untrackedValue$).toBe(NEEDS_COMPUTATION);
    expect(serializer).not.toHaveBeenCalled();
  });

  it('does not enumerate reactive stores while estimating a value', async () => {
    const store = createStore(null, { id: 1 }, StoreFlags.RECURSIVE);
    const ownKeys = vi.spyOn(StoreHandler.prototype, 'ownKeys');
    try {
      const signal = await roundTrip(readyComputed(store));
      expect(signal.$untrackedValue$).toBe(NEEDS_COMPUTATION);
      expect(ownKeys).not.toHaveBeenCalled();
    } finally {
      ownKeys.mockRestore();
    }
  });

  it('does not await unresolved nested promises', async () => {
    const signal = readyComputed({ pending: new Promise(() => {}) });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        roundTrip(signal),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('blocked SSR')), 300);
        }),
      ]);
      expect(result.$untrackedValue$).toBe(NEEDS_COMPUTATION);
    } finally {
      clearTimeout(timeout);
    }
  });

  it('omits deeply nested results without overflowing the stack', async () => {
    let value: object = {};
    for (let i = 0; i < 10000; i++) {
      value = { nested: value };
    }
    const signal = await roundTrip(readyComputed(value));
    expect(signal.$untrackedValue$).toBe(NEEDS_COMPUTATION);
  });

  it('respects noSerialize and invalid results', async () => {
    const skipped = readyComputed(noSerialize({ id: 1 }));
    const invalid = readyComputed({ id: 2 });
    invalid.$flags$ |= ComputedSignalFlags.CHECK;
    const restored = await roundTrip([skipped, invalid]);
    expect(restored.map((signal) => signal.$untrackedValue$)).toEqual([
      NEEDS_COMPUTATION,
      NEEDS_COMPUTATION,
    ]);
  });

  it('uses existing script escaping for retained values', async () => {
    const value = { name: '</script><script>alert(1)</script>' };
    const raw = await _serialize(readyComputed(value));
    expect(raw).not.toContain('</script>');
    const signal = await _deserialize<ComputedSignalImpl<typeof value>>(raw);
    expect(signal.value).toEqual(value);
  });

  it('retains the identity of small cyclic results', async () => {
    const value: { self?: unknown } = {};
    value.self = value;
    const signal = await roundTrip(readyComputed(value));
    expect(signal.value.self).toBe(signal.value);
  });

  it.each(['x'.repeat(2000), '\\'.repeat(600), '😀'.repeat(500), 1n << 300n])(
    'omits oversized scalar payloads',
    async (value) => {
      const signal = await roundTrip(readyComputed(value));
      expect(signal.$untrackedValue$).toBe(NEEDS_COMPUTATION);
    }
  );

  it('does not exceed the visit budget for wide results', async () => {
    const value = Object.fromEntries(Array.from({ length: 10000 }, (_, i) => [`field${i}`, 0]));
    const signal = await roundTrip(readyComputed(value));
    expect(signal.$untrackedValue$).toBe(NEEDS_COMPUTATION);
  });

  it('matches existing serialization of sparse arrays and null-prototype objects', async () => {
    const value = { sparse: new Array(3), plain: Object.assign(Object.create(null), { id: 1 }) };
    const signal = await roundTrip(readyComputed(value));
    expect(signal.value).toEqual(await roundTrip(value));
  });

  it('keeps explicit always and never behavior', async () => {
    const large = createComputed$(() => '', {
      serializationStrategy: 'always',
    }) as ComputedSignalImpl<string>;
    const small = createComputed$(() => 42, {
      serializationStrategy: 'never',
    }) as ComputedSignalImpl<number>;
    large.value = 'large'.repeat(10000);
    expect(small.value).toBe(42);
    const restored = await roundTrip([large, small]);
    expect(restored[0].value).toBe(large.value);
    expect(restored[1].$untrackedValue$).toBe(NEEDS_COMPUTATION);
  });

  it('keeps always as the default for computed and async signals', async () => {
    const value = 'default-always'.repeat(1000);
    const computed = createComputed$(() => '') as ComputedSignalImpl<string>;
    const asyncComputed = createComputed$(async () => '') as ComputedSignalImpl<string>;
    computed.value = value;
    await asyncComputed.promise();
    asyncComputed.value = value;
    const restored = await roundTrip([computed, asyncComputed]);
    expect(restored[0].value).toBe(value);
    expect(restored[1].value).toBe(value);
  });

  it('preserves later updates of dependencies', async () => {
    const source = createSignal(1);
    const computed = createComputed$(() => source.value * 2, {
      serializationStrategy: 'auto',
    });
    expect(computed.value).toBe(2);
    const restored = await roundTrip({ source, computed });
    expect(restored.computed.value).toBe(2);
    restored.source.value = 3;
    expect(restored.computed.value).toBe(6);
  });

  it('does not pull large results into a deferred segment', async () => {
    const value = { text: 'future-root'.repeat(10000) };
    const context = createSerializationContext(
      null,
      null,
      () => '',
      () => {},
      new WeakMap()
    );
    const root = context.$addRoot$(readyComputed(value));
    const roots = [root];
    context.$onAddRoot$ = (id) => roots.push(id);
    await context.$serializePatch$(0, roots);
    const patch = JSON.parse(context.$writer$.toString());
    const container = _createDeserializeContainer(patch[1]);
    const signal = container.$getObjectById$(0) as ComputedSignalImpl<unknown>;
    expect(signal.$untrackedValue$).toBe(NEEDS_COMPUTATION);
  });

  it('does not change an already emitted fallback when later segments arrive', async () => {
    const value = { text: 'late-segment'.repeat(10000) };
    const context = createSerializationContext(
      null,
      null,
      () => '',
      () => {},
      new WeakMap()
    );
    context.$addRoot$(readyComputed(value));
    await context.$serialize$();
    const original = JSON.parse(context.$writer$.toString());
    const container = _createDeserializeContainer(original);
    const signal = container.$getObjectById$(0) as ComputedSignalImpl<unknown>;
    expect(signal.$untrackedValue$).toBe(NEEDS_COMPUTATION);
    const start = context.$roots$.length;
    const root = context.$addRoot$(value);
    const chunks: string[] = [];
    context.$setWriter$(
      createStringStreamWriter((chunk) => {
        chunks.push(chunk);
      })
    );
    await context.$serializePatch$(start, [root]);
    expect(chunks.join('')).toContain(value.text);
    expect(signal.$untrackedValue$).toBe(NEEDS_COMPUTATION);
  });
});
