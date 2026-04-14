/**
 * Tests for loop-hoisting module.
 *
 * Tests loop detection (all 6 types), .w() hoisting plan generation,
 * q:p/q:ps injection, and positional parameter padding.
 */

import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { walk } from 'oxc-walker';
import {
  detectLoopContext,
  generateParamPadding,
  buildQpProp,
} from '../../src/optimizer/loop-hoisting.js';

// ---------------------------------------------------------------------------
// Helper: parse source and find first node of given type
// ---------------------------------------------------------------------------

function findFirstNode(source: string, nodeType: string): any {
  const { program } = parseSync('test.tsx', source);
  let found: any = null;
  walk(program, {
    enter(node: any) {
      if (!found && node.type === nodeType) {
        found = node;
      }
    },
  });
  return found;
}

// ---------------------------------------------------------------------------
// detectLoopContext
// ---------------------------------------------------------------------------

describe('detectLoopContext', () => {
  it('detects .map() call expression', () => {
    const source = `results.map((item) => item + 1)`;
    const node = findFirstNode(source, 'CallExpression');
    const ctx = detectLoopContext(node, source);
    expect(ctx).not.toBeNull();
    expect(ctx!.type).toBe('map');
    expect(ctx!.iterVars).toEqual(['item']);
  });

  it('detects .map() with index parameter', () => {
    const source = `results.map((item, index) => item + index)`;
    const node = findFirstNode(source, 'CallExpression');
    const ctx = detectLoopContext(node, source);
    expect(ctx).not.toBeNull();
    expect(ctx!.type).toBe('map');
    expect(ctx!.iterVars).toEqual(['item', 'index']);
  });

  it('detects ForStatement (for-i)', () => {
    const source = `for (let i = 0; i < 10; i++) { console.log(i); }`;
    const node = findFirstNode(source, 'ForStatement');
    const ctx = detectLoopContext(node, source);
    expect(ctx).not.toBeNull();
    expect(ctx!.type).toBe('for-i');
    expect(ctx!.iterVars).toEqual(['i']);
  });

  it('detects ForOfStatement (for-of)', () => {
    const source = `for (const item of results) { console.log(item); }`;
    const node = findFirstNode(source, 'ForOfStatement');
    const ctx = detectLoopContext(node, source);
    expect(ctx).not.toBeNull();
    expect(ctx!.type).toBe('for-of');
    expect(ctx!.iterVars).toEqual(['item']);
  });

  it('detects ForInStatement (for-in)', () => {
    const source = `for (const key in obj) { console.log(key); }`;
    const node = findFirstNode(source, 'ForInStatement');
    const ctx = detectLoopContext(node, source);
    expect(ctx).not.toBeNull();
    expect(ctx!.type).toBe('for-in');
    expect(ctx!.iterVars).toEqual(['key']);
  });

  it('detects WhileStatement', () => {
    const source = `while (i < 10) { i++; }`;
    const node = findFirstNode(source, 'WhileStatement');
    const ctx = detectLoopContext(node, source);
    expect(ctx).not.toBeNull();
    expect(ctx!.type).toBe('while');
    expect(ctx!.iterVars).toEqual([]);
  });

  it('detects DoWhileStatement', () => {
    const source = `do { i++; } while (i < 10);`;
    const node = findFirstNode(source, 'DoWhileStatement');
    const ctx = detectLoopContext(node, source);
    expect(ctx).not.toBeNull();
    expect(ctx!.type).toBe('do-while');
    expect(ctx!.iterVars).toEqual([]);
  });

  it('returns null for non-loop node', () => {
    const source = `const x = 1 + 2;`;
    const node = findFirstNode(source, 'VariableDeclaration');
    const ctx = detectLoopContext(node, source);
    expect(ctx).toBeNull();
  });

  it('returns null for non-.map() call expression', () => {
    const source = `results.filter((item) => item > 0)`;
    const node = findFirstNode(source, 'CallExpression');
    const ctx = detectLoopContext(node, source);
    expect(ctx).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// generateParamPadding
// ---------------------------------------------------------------------------

describe('generateParamPadding', () => {
  it('generates base padding with no loop vars', () => {
    const params = generateParamPadding([]);
    expect(params).toEqual(['_', '_1']);
  });

  it('generates padding with single loop var', () => {
    const params = generateParamPadding(['item']);
    expect(params).toEqual(['_', '_1', 'item']);
  });

  it('generates padding with multiple loop vars', () => {
    const params = generateParamPadding(['index', 'item']);
    expect(params).toEqual(['_', '_1', 'index', 'item']);
  });
});

// ---------------------------------------------------------------------------
// buildQpProp
// ---------------------------------------------------------------------------

describe('buildQpProp', () => {
  it('returns null for empty loop vars', () => {
    const result = buildQpProp([]);
    expect(result).toBeNull();
  });

  it('returns q:p for single loop var', () => {
    const result = buildQpProp(['item']);
    expect(result).not.toBeNull();
    expect(result!.propName).toBe('q:p');
    expect(result!.propValue).toBe('item');
  });

  it('returns q:ps for multiple loop vars sorted alphabetically', () => {
    const result = buildQpProp(['index', 'item']);
    expect(result).not.toBeNull();
    expect(result!.propName).toBe('q:ps');
    expect(result!.propValue).toBe('[index, item]');
  });

  it('sorts loop vars alphabetically for q:ps', () => {
    const result = buildQpProp(['z', 'a', 'm']);
    expect(result).not.toBeNull();
    expect(result!.propName).toBe('q:ps');
    expect(result!.propValue).toBe('[a, m, z]');
  });
});

// ---------------------------------------------------------------------------
// Snapshot-matching patterns
// ---------------------------------------------------------------------------

describe('snapshot pattern matching', () => {
  it('matches loop hoisting pattern from event_listeners_inside_loop snap', () => {
    // From snapshot: paramNames: ["_", "_1", "item"], captureNames: ["cart"]
    // The handler segment signature is (_, _1, item) with cart captured via .w()
    const params = generateParamPadding(['item']);
    expect(params).toEqual(['_', '_1', 'item']);

    const qp = buildQpProp(['item']);
    expect(qp!.propName).toBe('q:p');
    expect(qp!.propValue).toBe('item');
  });

  it('matches nested loop pattern from cross_scope snap', () => {
    // From snapshot: paramNames: ["_", "_1", "j", "cellKey"], captureNames: ["i"]
    // Multiple loop vars -> q:ps sorted alphabetically
    const params = generateParamPadding(['j', 'cellKey']);
    expect(params).toEqual(['_', '_1', 'j', 'cellKey']);

    const qp = buildQpProp(['j', 'cellKey']);
    expect(qp!.propName).toBe('q:ps');
    expect(qp!.propValue).toBe('[cellKey, j]');
  });

  it('matches for-i loop pattern with captures', () => {
    // From snapshot: paramNames: ["_", "_1", "i"], captureNames: ["cart", "results"]
    const params = generateParamPadding(['i']);
    expect(params).toEqual(['_', '_1', 'i']);
  });

  it('matches for-in loop pattern with key iter var', () => {
    // From snapshot: paramNames: ["_", "_1", "key"], captureNames: ["cart", "results"]
    const params = generateParamPadding(['key']);
    expect(params).toEqual(['_', '_1', 'key']);

    const qp = buildQpProp(['key']);
    expect(qp!.propName).toBe('q:p');
    expect(qp!.propValue).toBe('key');
  });
});
