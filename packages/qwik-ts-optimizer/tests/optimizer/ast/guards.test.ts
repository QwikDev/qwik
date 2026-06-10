/**
 * Unit tests for `src/optimizer/ast/guards.ts` helpers.
 *
 * Coverage focus: pin the contract of the new `someAstChild`
 * utility (short-circuit version of `forEachAstChild`). The existing
 * `forEachAstChild` is implicitly covered by every walker that uses it;
 * we add a thin smoke test alongside to anchor expectations.
 */

import { describe, it, expect } from 'vitest';
import { forEachAstChild, someAstChild } from '../../../src/optimizer/ast/guards.js';
import type { AstCompatNode, AstNode } from '../../../src/ast-types.js';

// Tests use synthetic `type` strings (`'A'`, `'B'`, `'Foo'`, etc.) that
// don't satisfy `AstNode`'s strict discriminated-union — the goal is
// to exercise traversal mechanics (short-circuit, skip-keys, parent
// threading) independent of real node shapes. The `AstCompatNode`
// duck-typed shape is the right input type here; downstream
// comparisons cast `.type` to `string` since the iterator now
// surfaces `AstNode`'s strict union at the visitor boundary.
function mkNode(type: string, extra: Record<string, unknown> = {}): AstCompatNode {
  return { type, start: 0, end: 0, ...extra };
}

describe('someAstChild', () => {
  it('returns false when node is null/undefined', () => {
    expect(someAstChild(null, () => true)).toBe(false);
    expect(someAstChild(undefined, () => true)).toBe(false);
  });

  it('returns false when node has no AST-node children', () => {
    const node = mkNode('Foo', { name: 'x', value: 42 });
    expect(someAstChild(node, () => true)).toBe(false);
  });

  it('returns true on first matching direct child', () => {
    const child = mkNode('Bar');
    const node = mkNode('Foo', { body: child });
    let calls = 0;
    const result = someAstChild(node, () => { calls++; return true; });
    expect(result).toBe(true);
    expect(calls).toBe(1);
  });

  it('returns true on first matching array element', () => {
    const a = mkNode('A');
    const b = mkNode('B');
    const node = mkNode('Foo', { items: [a, b] });
    let seen: string[] = [];
    const result = someAstChild(node, (child) => {
      seen.push(child.type);
      return (child.type as string) === 'B';
    });
    expect(result).toBe(true);
    expect(seen).toEqual(['A', 'B']);
  });

  it('short-circuits — does not visit later children after first match', () => {
    const a = mkNode('A');
    const b = mkNode('B');
    const c = mkNode('C');
    const node = mkNode('Foo', { items: [a, b, c] });
    let seen: string[] = [];
    someAstChild(node, (child) => {
      seen.push(child.type);
      return (child.type as string) === 'B';
    });
    expect(seen).toEqual(['A', 'B']);
    expect(seen).not.toContain('C');
  });

  it('returns false when no child matches', () => {
    const node = mkNode('Foo', { a: mkNode('A'), b: mkNode('B') });
    let calls = 0;
    const result = someAstChild(node, () => { calls++; return false; });
    expect(result).toBe(false);
    expect(calls).toBe(2);
  });

  it('skips meta keys (type/start/end/loc/range) by default', () => {
    // None of these are AST nodes; loc/range are numeric arrays. The default
    // skipKeys + isAstNode validation ensures no false positives.
    const node = mkNode('Foo', {
      type: 'Foo',
      start: 0,
      end: 10,
      loc: [0, 10],
      range: [0, 10],
    });
    expect(someAstChild(node, () => true)).toBe(false);
  });

  it('passes correct key + parent to predicate', () => {
    const child = mkNode('Bar');
    const parent = mkNode('Foo', { body: child });
    let capturedKey: string | null = null;
    let capturedParent: AstNode | null = null;
    someAstChild(parent, (c, key, p) => {
      capturedKey = key;
      capturedParent = p;
      return true;
    });
    expect(capturedKey).toBe('body');
    expect(capturedParent).toBe(parent);
  });
});

describe('forEachAstChild', () => {
  it('visits all AST-node children', () => {
    const a = mkNode('A');
    const b = mkNode('B');
    const node = mkNode('Foo', { left: a, right: b });
    const seen: string[] = [];
    forEachAstChild(node, (child) => { seen.push(child.type); });
    expect(seen.sort()).toEqual(['A', 'B']);
  });

  it('visits array elements when they are AST nodes', () => {
    const items = [mkNode('A'), mkNode('B'), mkNode('C')];
    const node = mkNode('Foo', { items });
    const seen: string[] = [];
    forEachAstChild(node, (child) => { seen.push(child.type); });
    expect(seen).toEqual(['A', 'B', 'C']);
  });

  it('skips non-object values', () => {
    const node = mkNode('Foo', { count: 5, name: 'x', flag: true });
    const seen: string[] = [];
    forEachAstChild(node, (child) => { seen.push(child.type); });
    expect(seen).toEqual([]);
  });
});
