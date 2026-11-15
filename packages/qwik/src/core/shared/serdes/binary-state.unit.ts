import { describe, expect, it } from 'vitest';
import { createSerializationContext } from '../../../serializer';
import { BinaryStateWriter } from '../../../serializer/binary-state-writer';
import type { DeserializeContainer } from '../types';
import { BinaryCode, BinaryStateReader, isBinaryState } from './binary-state';
import { binaryStateRootsToJson } from './binary-state-dump';
import { Constants, TypeIds } from './constants';
import { SERIALIZER_PROXY_UNWRAP, wrapBinaryStateProxy } from './deser-proxy';

/** Markup and control characters: what a script element or a formatter would alter. */
// eslint-disable-next-line no-control-regex
const UNSAFE_IN_SCRIPT = /[<\0-\x1f\x7f-\x9f]/;

const newContext = () =>
  createSerializationContext(
    null,
    null,
    () => '',
    () => {},
    new WeakMap<any, any>()
  );

/** Collects the pieces that `context` writes from now on. */
const collectWrites = (context: ReturnType<typeof newContext>): string[] => {
  const pieces: string[] = [];
  context.$setWriter$({
    write: (text) => void pieces.push(text),
    writeRootRef() {},
    writeRootRefPath() {},
    writeRootRefDelta() {},
    toString: () => pieces.join(''),
  });
  return pieces;
};

const serialize = async (...roots: unknown[]): Promise<string> => {
  const context = newContext();
  for (let i = 0; i < roots.length; i++) {
    context.$addRoot$(roots[i]);
  }
  const pieces = collectWrites(context);
  await context.$serializeBinary$();
  return pieces.join('');
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

  it('restores many strings, short and long', async () => {
    const strings = Array.from({ length: 20000 }, (_, i) => 'string ' + i);
    strings.push('', 'a', 'abc', 'x'.repeat(20000));
    expect(Array.from(await roundTrip(strings))[0]).toEqual(strings);
  });

  it('restores strings a script element would alter', async () => {
    const strings = [
      'nul \0 inside',
      'line\r\nbreaks\r',
      'tab\tand\nnewline',
      '</script><!-- ',
      'lone \ud800 surrogate',
    ];
    const script = await serialize(strings);
    expect(script).not.toMatch(UNSAFE_IN_SCRIPT);
    expect(script).not.toContain('\ud800');
    expect(Array.from(restore(script))[0]).toEqual(strings);
  });

  it('restores quotes, backslashes and characters beyond ASCII as they are', async () => {
    const strings = [
      'say "hi" \\ there',
      'naïve café',
      '日本語のテキスト',
      'emoji 😀 pair',
      '\n\t',
    ];
    const script = await serialize(strings);
    expect(script).toContain('日本語のテキスト');
    expect(Array.from(restore(script))[0]).toEqual(strings);
  });

  it('writes a repeated string once', async () => {
    const script = await serialize([
      'a repeated string',
      ['a repeated string'],
      'a repeated string',
    ]);
    expect(script.split('a repeated string').length - 1).toBe(1);
    expect(Array.from(restore(script))[0]).toEqual([
      'a repeated string',
      ['a repeated string'],
      'a repeated string',
    ]);
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
  });

  describe('state patches', () => {
    /** Serializes the shell roots, then every later group of roots as a patch. */
    const stream = async (shell: unknown[], ...patches: unknown[][]) => {
      const context = newContext();
      const addRoots = (roots: unknown[]) => roots.map((root) => context.$addRoot$(root));
      addRoots(shell);
      const shellPieces = collectWrites(context);
      await context.$serializeBinary$();
      const scripts = [shellPieces.join('')];
      for (let i = 0; i < patches.length; i++) {
        const rootStart = context.$roots$.length;
        const rootIds: number[] = [];
        // Roots found while serializing join the patch, as they do for a segment.
        context.$onAddRoot$ = (rootId) => rootIds.push(rootId);
        addRoots(patches[i]);
        const patchPieces = collectWrites(context);
        await context.$serializeBinaryPatch$(
          context.$getBinaryStream$(),
          rootStart,
          rootIds,
          undefined,
          (rootId) => rootId
        );
        scripts.push(patchPieces.join(''));
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
      // the stream ends before anything asks for the patch's roots
      reader.$restoredByOffset$ = null;
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

  describe('writing while serializing', () => {
    it('writes a large state out in pieces', async () => {
      const rows = Array.from({ length: 5000 }, (_, i) => ({ i, name: 'row ' + i }));
      const context = newContext();
      context.$addRoot$(rows);
      const pieces = collectWrites(context);
      await context.$serializeBinary$();
      expect(pieces.length).toBeGreaterThan(10);
      expect(Array.from(restore(pieces.join('')))[0]).toEqual(rows);
    });

    it('writes out what is ready before it waits for a promise', async () => {
      let resolve!: (value: string) => void;
      const context = newContext();
      context.$addRoot$('ready before the wait');
      context.$addRoot$(new Promise<string>((r) => (resolve = r)));
      const pieces = collectWrites(context);
      const done = context.$serializeBinary$();
      await new Promise((r) => setTimeout(r, 5));
      expect(pieces.join('')).toContain('ready before the wait');
      resolve('late');
      await done;
      await expect(restore(pieces.join(''))[1]).resolves.toBe('late');
    });
  });

  it('writes nothing that could end or alter the script element', async () => {
    const values = Array.from({ length: 5000 }, (_, i) => [i, '</script><!--' + i, i / 7]);
    const script = await serialize(values);
    // no markup, no control characters, and no whitespace other than the spaces inside strings
    expect(script).not.toMatch(UNSAFE_IN_SCRIPT);
    expect(Array.from(restore(script))[0]).toEqual(values);
  });

  it('restores every unit value, including the ones written as other characters', async () => {
    // one-unit integers cover the units 19-127; counts, lengths and codes cover the rest
    const numbers = Array.from({ length: 2000 }, (_, i) => i);
    const script = await serialize(numbers, 'a string after the numbers');
    expect(script).not.toMatch(UNSAFE_IN_SCRIPT);
    expect(Array.from(restore(script))).toEqual([numbers, 'a string after the numbers']);
  });

  it('rejects an item count larger than the units that hold the items', async () => {
    const script = await serialize(Array.from({ length: 20 }, (_, i) => i));
    // the root list is [..., Items0, count 1, ArrayEnd]; claim 17 roots instead
    const tampered =
      script.slice(0, -2) + String.fromCharCode(BinaryCode.Num0 + 17) + script.slice(-1);
    expect(() => new BinaryStateReader(tampered)).toThrow();
  });

  it('rejects a string length larger than the units that hold the string', async () => {
    const script = await serialize('a string');
    // the stream is [...'a string', length 8, Str1, root list]; claim 100 characters instead
    const lengthAt = script.indexOf('a string') + 8;
    const tampered =
      script.slice(0, lengthAt) + String.fromCharCode(100) + script.slice(lengthAt + 1);
    expect(tampered).not.toBe(script);
    expect(() => restore(tampered)[0]).toThrow();
  });

  it('rejects roots that restore the same values over and over', () => {
    let script = '';
    const writer = new BinaryStateWriter({ $stringEnds$: new Map(), $length$: 0 }, (text) => {
      script += text;
    });
    const itemCount = 200;
    for (let i = 0; i < itemCount; i++) {
      writer.$number$(i);
    }
    writer.$endArray$(0, itemCount);
    // every root is the same array again, which written state never does
    const rootsStart = writer.$length$;
    const itemsEnd = writer.$offset$;
    const rootCount = 60;
    for (let i = 0; i < rootCount; i++) {
      writer.$sharedRoot$(itemsEnd);
    }
    writer.$endArray$(rootsStart, rootCount);
    writer.$finish$();
    const state = restore(script);
    expect(state[0]).toHaveLength(itemCount);
    expect(() => Array.from({ length: rootCount }, (_, i) => state[i])).toThrow();
  });
});
