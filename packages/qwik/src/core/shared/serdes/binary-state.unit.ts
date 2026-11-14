import { describe, expect, it } from 'vitest';
import { _encodeBinaryState } from '../../../serializer/binary-state-encoder';
import { BinaryStateReader, isBinaryState } from './binary-state';
import { Constants, TypeIds } from './constants';
import { preprocessState } from './preprocess-state';

/** Reads every root the way the lazy proxy does. */
const readRoots = (stateJson: string) => {
  const reader = new BinaryStateReader(_encodeBinaryState(stateJson));
  const roots: unknown[] = [];
  for (let i = 0; i < reader.$rootEnds$.length; i++) {
    const root: unknown[] = [];
    reader.$readRoot$(i, root);
    roots.push(...root);
  }
  return { roots, forwardRefs: reader.$forwardRefs$ };
};

/** What the JSON reader hands to allocate() and inflate(). */
const preprocess = (stateJson: string) => {
  const state = JSON.parse(stateJson);
  const container = { $forwardRefs$: null } as any;
  preprocessState(state, container);
  return { roots: state, forwardRefs: container.$forwardRefs$ };
};

describe('binary state', () => {
  it('is told apart from JSON state by its first character', () => {
    expect(isBinaryState('[0,1]')).toBe(false);
    expect(isBinaryState(_encodeBinaryState('[0,1]'))).toBe(true);
  });

  it('reads back numbers of every size', () => {
    const numbers = [0, 63, 64, 255, 256, 65535, 65536, 2 ** 32 - 1, 2 ** 32, 1.7e12];
    const values = [...numbers, ...numbers.slice(1).map((n) => -n), 2.573, 1e-7];
    const state = JSON.stringify(values.flatMap((n) => [TypeIds.Plain, n]));
    expect(readRoots(state).roots).toEqual(values.flatMap((n) => [TypeIds.Plain, n]));
  });

  it('reads back more strings than fit a one-byte index', () => {
    const strings = Array.from({ length: 70000 }, (_, i) => 'string ' + i);
    const state = JSON.stringify([TypeIds.Array, strings.flatMap((s) => [TypeIds.Plain, s])]);
    expect(readRoots(state)).toEqual(preprocess(state));
  });

  it('reads back nested containers, typed values and constants', () => {
    const state = JSON.stringify([
      TypeIds.Object,
      [
        TypeIds.Plain,
        'list',
        TypeIds.Array,
        [TypeIds.Constant, Constants.Null, TypeIds.Array, [], TypeIds.Object, 0],
        TypeIds.Plain,
        'when',
        TypeIds.Date,
        1700000000000,
        TypeIds.Plain,
        'url',
        TypeIds.URL,
        'http://localhost/',
      ],
      TypeIds.Signal,
      [TypeIds.RootRef, 0],
    ]);
    expect(readRoots(state)).toEqual(preprocess(state));
  });

  it('keeps one object for a value that is also referenced through a root', () => {
    const shared = [TypeIds.Plain, 'shared', TypeIds.Plain, 1];
    const state = JSON.stringify([
      TypeIds.Object,
      [TypeIds.Plain, 'foo', TypeIds.Object, shared],
      TypeIds.Object,
      [TypeIds.Plain, 'bar', TypeIds.RootRef, 2],
      TypeIds.RootRef,
      '0 1',
    ]);
    const { roots } = readRoots(state);
    expect(roots).toEqual(preprocess(state).roots);
    // the parent points at the root instead of holding a second copy
    expect((roots[1] as unknown[]).slice(2, 4)).toEqual([TypeIds.RootRef, 2]);
  });

  it('reads a shared string in place, strings have no identity', () => {
    const state = JSON.stringify([
      TypeIds.Array,
      [TypeIds.Plain, 'long string'],
      TypeIds.RootRef,
      '0 0',
    ]);
    expect(readRoots(state).roots).toEqual([
      TypeIds.Array,
      [TypeIds.Plain, 'long string'],
      TypeIds.Plain,
      'long string',
    ]);
  });

  it('resolves a path that passes through an earlier shared value', () => {
    const state = JSON.stringify([
      TypeIds.Array,
      [TypeIds.Object, [TypeIds.Plain, 'a', TypeIds.Array, [TypeIds.Plain, 'deep']]],
      TypeIds.RootRef,
      '0 0',
      TypeIds.RootRef,
      '0 0 1',
    ]);
    expect(readRoots(state)).toEqual(preprocess(state));
  });

  it('exposes forward refs', () => {
    const state = JSON.stringify([
      TypeIds.ForwardRef,
      1,
      TypeIds.Plain,
      'x',
      TypeIds.ForwardRefs,
      [-1, 1],
    ]);
    expect(readRoots(state)).toEqual(preprocess(state));
    expect(readRoots(state).forwardRefs).toEqual([-1, 1]);
  });

  it('escapes < in strings so they cannot close the script element', () => {
    const script = _encodeBinaryState(JSON.stringify([TypeIds.Plain, '</script><b>']));
    expect(script).not.toContain('<');
    expect(readRoots(JSON.stringify([TypeIds.Plain, '</script><b>'])).roots[1]).toBe(
      '</script><b>'
    );
  });

  it('rejects an item count larger than the bytes that hold the items', () => {
    const [base64, strings] = _encodeBinaryState('[0,1]').split('\n');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    bytes[bytes.length - 2] = 163; // claim 63 roots
    const tampered = btoa(String.fromCharCode(...bytes)) + '\n' + strings;
    expect(() => new BinaryStateReader(tampered)).toThrow();
  });
});
