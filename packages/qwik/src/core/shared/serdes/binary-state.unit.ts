import { describe, expect, it } from 'vitest';
import { createSerializationContext } from '../../../serializer';
import type { DeserializeContainer } from '../types';
import { BinaryCode, BinaryStateReader, isBinaryState } from './binary-state';
import { binaryStateRootsToJson } from './binary-state-dump';
import { Constants, TypeIds } from './constants';
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

  describe('releasing the state', () => {
    const restoredRoots = (state: unknown[]) => (state as any)[SERIALIZER_PROXY_UNWRAP];
    const backgroundWork = () => new Promise((resolve) => setTimeout(resolve, 30));
    const big = Array.from({ length: 2000 }, (_, i) => ({ i }));

    it('leaves untouched roots unrestored while much of the state is unread', async () => {
      const state = await roundTrip({ small: 1 }, big);
      state[0];
      await backgroundWork();
      expect(restoredRoots(state)[1]).toBeUndefined();
    });

    it('restores the rest in the background once 90% is restored', async () => {
      const leftover = Array.from({ length: 1000 }, (_, i) => ({ i }));
      const most = Array.from({ length: 20000 }, (_, i) => ({ i }));
      const state = await roundTrip(leftover, most);
      state[1];
      expect(restoredRoots(state)[0]).toBeUndefined();
      await backgroundWork();
      expect(restoredRoots(state)[0]).toEqual(leftover);
      expect(state[0]).toBe(restoredRoots(state)[0]);
    });

    it('restores the rest in the background once little is left', async () => {
      const state = await roundTrip({ small: 1 }, { alsoSmall: 2 }, { tiny: 3 });
      state[2];
      expect(restoredRoots(state)[0]).toBeUndefined();
      await backgroundWork();
      expect(restoredRoots(state).slice(0, 2)).toEqual([{ small: 1 }, { alsoSmall: 2 }]);
    });
  });

  describe('state patches', () => {
    /** Serializes the shell roots, then every later group of roots as a patch. */
    const stream = async (shell: unknown[], ...patches: unknown[][]) => {
      const context = createSerializationContext(
        null,
        null,
        () => '',
        () => {},
        new WeakMap<any, any>()
      );
      const addRoots = (roots: unknown[]) => roots.map((root) => context.$addRoot$(root));
      addRoots(shell);
      const scripts = [await context.$serializeBinary$()];
      for (let i = 0; i < patches.length; i++) {
        const rootStart = context.$roots$.length;
        const rootIds: number[] = [];
        // Roots found while serializing join the patch, as they do for a segment.
        context.$onAddRoot$ = (rootId) => rootIds.push(rootId);
        addRoots(patches[i]);
        scripts.push(
          await context.$serializeBinaryPatch$(
            context.$getBinaryStream$(),
            rootStart,
            rootIds,
            undefined,
            (rootId) => rootId
          )
        );
      }
      return scripts;
    };
    const open = (shellScript: string) => {
      const reader = new BinaryStateReader(shellScript);
      reader.$restoredByOffset$ = new Map();
      const container: DeserializeContainer = {
        $getObjectById$: (id) => state[Number(id)],
        $getForwardRef$: () => undefined,
        getSyncFn: () => () => {},
        $storeProxyMap$: new WeakMap(),
        element: null,
        $forwardRefs$: null,
      };
      const state = wrapBinaryStateProxy(container as any, reader) as any[];
      return { reader, state };
    };

    it('adds the roots of a patch after the roots of the shell', async () => {
      const [shell, patch] = await stream([{ shell: 1 }], [{ late: 2 }, 'text']);
      const { reader, state } = open(shell);
      expect(reader.$addPatch$(patch)).toEqual({ $forwardRefs$: 0, $extraRootId$: undefined });
      expect(state.length).toBe(3);
      expect(Array.from(state)).toEqual([{ shell: 1 }, { late: 2 }, 'text']);
    });

    it('restores strings that an earlier script already carried', async () => {
      const [shell, patch] = await stream(
        ['a string from the shell'],
        [['a string from the shell']]
      );
      expect(patch).not.toContain('a string from the shell');
      const { reader, state } = open(shell);
      reader.$addPatch$(patch);
      expect(state[1]).toEqual(['a string from the shell']);
    });

    it('shares an object the shell has not restored yet', async () => {
      const nested = { name: 'nested' };
      const [shell, patch] = await stream([{ nested }], [{ again: nested }]);
      const { reader, state } = open(shell);
      reader.$addPatch$(patch);
      expect(state[1].again).toEqual(nested);
      expect(state[0].nested).toBe(state[1].again);
    });

    it('shares an object that was restored before the patch arrived', async () => {
      const nested = { name: 'nested' };
      const [shell, patch] = await stream([{ nested }], [{ again: nested }]);
      const { reader, state } = open(shell);
      const restored = state[0].nested;
      reader.$addPatch$(patch);
      expect(state[1].again).toBe(restored);
    });

    it('shares objects across more than one patch', async () => {
      const nested = { name: 'nested' };
      const [shell, first, second] = await stream(
        [{ nested }],
        [{ first: nested }],
        [{ second: nested }]
      );
      const { reader, state } = open(shell);
      reader.$addPatch$(first);
      reader.$addPatch$(second);
      expect(state[3].second).toBe(state[1].first);
      expect(state[0].nested).toBe(state[1].first);
    });

    it('rejects a patch that does not continue the roots received so far', async () => {
      const [shell, first, second] = await stream([1], [2], [3]);
      const { reader, state } = open(shell);
      expect(reader.$addPatch$(second)).toBeNull();
      expect(state.length).toBe(1);
      expect(reader.$addPatch$(first)).not.toBeNull();
      expect(Array.from(state)).toEqual([1, 2]);
    });

    it('keeps the state text until no more patches can arrive', async () => {
      const [shell] = await stream([{ small: 1 }, { tiny: 2 }]);
      const { reader, state } = open(shell);
      state[1];
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect((state as any)[SERIALIZER_PROXY_UNWRAP][0]).toBeUndefined();
      reader.$restoredByOffset$ = null;
    });
  });

  describe('reading the state back as typeId/value pairs', () => {
    it('shows a shared value at its root and a root ref where it is nested', async () => {
      const shared = { name: 'shared' };
      const script = await serialize({ shared }, { again: shared });
      expect(binaryStateRootsToJson(script)).toEqual([
        TypeIds.Object,
        [TypeIds.Plain, 'shared', TypeIds.RootRef, 2],
        TypeIds.Object,
        [TypeIds.Plain, 'again', TypeIds.RootRef, 2],
        TypeIds.Object,
        [TypeIds.Plain, 'name', TypeIds.Plain, 'shared'],
      ]);
    });

    it('reads numbers, constants and typed values', async () => {
      const script = await serialize([1, -200, 2.5, null, new Date(1700000000000)]);
      expect(binaryStateRootsToJson(script)).toEqual([
        TypeIds.Array,
        [
          TypeIds.Plain,
          1,
          TypeIds.Plain,
          -200,
          TypeIds.Plain,
          2.5,
          TypeIds.Constant,
          Constants.Null,
          TypeIds.Date,
          1700000000000,
        ],
      ]);
    });
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
