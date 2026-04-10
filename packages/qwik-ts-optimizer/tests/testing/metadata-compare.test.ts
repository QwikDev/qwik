import { describe, it, expect } from 'vitest';
import {
  compareMetadata,
  type MetadataCompareResult,
} from '../../src/testing/metadata-compare.js';
import type { SegmentMetadata } from '../../src/testing/snapshot-parser.js';

function makeMetadata(overrides: Partial<SegmentMetadata> = {}): SegmentMetadata {
  return {
    origin: 'test_component.tsx',
    name: 's_abc123',
    entry: null,
    displayName: 'TestComponent_component',
    hash: 'abc123',
    canonicalFilename: 'test_component.tsx',
    path: '',
    extension: 'tsx',
    parent: null,
    ctxKind: 'event',
    ctxName: 'component$',
    captures: false,
    loc: [10, 50],
    ...overrides,
  };
}

describe('compareMetadata', () => {
  it('identical metadata matches', () => {
    const a = makeMetadata();
    const b = makeMetadata();
    const result = compareMetadata(a, b);
    expect(result.match).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  it('hash mismatch detected', () => {
    const a = makeMetadata({ hash: 'abc123' });
    const b = makeMetadata({ hash: 'def456' });
    const result = compareMetadata(a, b);
    expect(result.match).toBe(false);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0].field).toBe('hash');
    expect(result.mismatches[0].expected).toBe('abc123');
    expect(result.mismatches[0].actual).toBe('def456');
  });

  it('multiple mismatches reported', () => {
    const a = makeMetadata({ name: 's_abc', displayName: 'Foo' });
    const b = makeMetadata({ name: 's_xyz', displayName: 'Bar' });
    const result = compareMetadata(a, b);
    expect(result.match).toBe(false);
    expect(result.mismatches).toHaveLength(2);
    const fields = result.mismatches.map((m) => m.field);
    expect(fields).toContain('name');
    expect(fields).toContain('displayName');
  });

  it('loc mismatch detected', () => {
    const a = makeMetadata({ loc: [10, 50] });
    const b = makeMetadata({ loc: [10, 55] });
    const result = compareMetadata(a, b);
    expect(result.match).toBe(false);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0].field).toBe('loc');
  });

  it('optional fields - both present and matching', () => {
    const a = makeMetadata({ paramNames: ['a', 'b'], captureNames: ['x'] });
    const b = makeMetadata({ paramNames: ['a', 'b'], captureNames: ['x'] });
    const result = compareMetadata(a, b);
    expect(result.match).toBe(true);
  });

  it('optional fields - one missing causes mismatch', () => {
    const a = makeMetadata({ paramNames: ['a', 'b'] });
    const b = makeMetadata();
    const result = compareMetadata(a, b);
    expect(result.match).toBe(false);
    expect(result.mismatches[0].field).toBe('paramNames');
  });

  it('captures boolean mismatch', () => {
    const a = makeMetadata({ captures: true });
    const b = makeMetadata({ captures: false });
    const result = compareMetadata(a, b);
    expect(result.match).toBe(false);
    expect(result.mismatches[0].field).toBe('captures');
  });

  it('null vs string fields mismatch', () => {
    const a = makeMetadata({ entry: null });
    const b = makeMetadata({ entry: 'something' });
    const result = compareMetadata(a, b);
    expect(result.match).toBe(false);
    expect(result.mismatches[0].field).toBe('entry');
    expect(result.mismatches[0].expected).toBeNull();
    expect(result.mismatches[0].actual).toBe('something');
  });
});
