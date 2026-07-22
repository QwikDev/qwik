
import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { walk } from 'oxc-walker';
import type { AstNode } from '../../../src/ast-types.js';
import {
  detectLoopContext,
  generateParamPadding,
  buildCaptureProp,
  eventHandlerQpParams,
} from '../../../src/optimizer/jsx/loop-hoisting.js';

function findFirstNode(source: string, nodeType: string): AstNode {
  const { program } = parseSync('test.tsx', source);
  let found: AstNode | undefined;
  walk(program, {
    enter(node: AstNode) {
      if (!found && node.type === nodeType) {
        found = node;
      }
    },
  });
  if (!found) throw new Error(`No ${nodeType} node found in source`);
  return found;
}

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

describe('eventHandlerQpParams', () => {
  it('returns [] for an empty param list', () => {
    expect(eventHandlerQpParams([])).toEqual([]);
  });

  it('returns [] when the `_, _1` prefix is absent', () => {
    expect(eventHandlerQpParams(['ev'])).toEqual([]);
    expect(eventHandlerQpParams(['event', 'element', 'item'])).toEqual([]);
    expect(eventHandlerQpParams(['_'])).toEqual([]);
    expect(eventHandlerQpParams(['_', 'el', 'item'])).toEqual([]);
  });

  it('returns [] for a bare `_, _1` prefix with no capture params', () => {
    expect(eventHandlerQpParams(['_', '_1'])).toEqual([]);
  });

  it('returns capture params after the prefix in positional order', () => {
    expect(eventHandlerQpParams(['_', '_1', 'item'])).toEqual(['item']);
    expect(eventHandlerQpParams(['_', '_1', 'item', 'idx'])).toEqual([
      'item',
      'idx',
    ]);
  });

  it('skips numbered padding params from unused slots', () => {
    expect(eventHandlerQpParams(['_', '_1', '_2', 'idx'])).toEqual(['idx']);
    expect(eventHandlerQpParams(['_', '_1', 'item', '_3', 'key'])).toEqual([
      'item',
      'key',
    ]);
    expect(eventHandlerQpParams(['_', '_1', '_2', '_3'])).toEqual([]);
  });

  it('skips a bare `_` param past the prefix', () => {
    expect(eventHandlerQpParams(['_', '_1', '_'])).toEqual([]);
    expect(eventHandlerQpParams(['_', '_1', '_', 'item'])).toEqual(['item']);
    expect(eventHandlerQpParams(['_', '_1', 'item', '_'])).toEqual(['item']);
  });

  it('keeps underscore-prefixed identifiers that are not padding-shaped', () => {
    expect(eventHandlerQpParams(['_', '_1', '_foo', '_bar2'])).toEqual([
      '_foo',
      '_bar2',
    ]);
  });
});

describe('buildCaptureProp', () => {
  it('returns null for empty loop vars', () => {
    const result = buildCaptureProp([]);
    expect(result).toBeNull();
  });

  it('returns q:p for single loop var', () => {
    const result = buildCaptureProp(['item']);
    expect(result).not.toBeNull();
    expect(result!.propName).toBe('q:p');
    expect(result!.propValue).toBe('item');
  });

  it('returns q:ps for multiple loop vars sorted alphabetically', () => {
    const result = buildCaptureProp(['index', 'item']);
    expect(result).not.toBeNull();
    expect(result!.propName).toBe('q:ps');
    expect(result!.propValue).toBe('[index, item]');
  });

  it('sorts loop vars alphabetically for q:ps', () => {
    const result = buildCaptureProp(['z', 'a', 'm']);
    expect(result).not.toBeNull();
    expect(result!.propName).toBe('q:ps');
    expect(result!.propValue).toBe('[a, m, z]');
  });
});

describe('snapshot pattern matching', () => {
  it('matches loop hoisting pattern from event_listeners_inside_loop snap', () => {
    const params = generateParamPadding(['item']);
    expect(params).toEqual(['_', '_1', 'item']);

    const qp = buildCaptureProp(['item']);
    expect(qp!.propName).toBe('q:p');
    expect(qp!.propValue).toBe('item');
  });

  it('matches nested loop pattern from cross_scope snap', () => {
    const params = generateParamPadding(['j', 'cellKey']);
    expect(params).toEqual(['_', '_1', 'j', 'cellKey']);

    const qp = buildCaptureProp(['j', 'cellKey']);
    expect(qp!.propName).toBe('q:ps');
    expect(qp!.propValue).toBe('[cellKey, j]');
  });

  it('matches for-i loop pattern with captures', () => {
    const params = generateParamPadding(['i']);
    expect(params).toEqual(['_', '_1', 'i']);
  });

  it('matches for-in loop pattern with key iter var', () => {
    const params = generateParamPadding(['key']);
    expect(params).toEqual(['_', '_1', 'key']);

    const qp = buildCaptureProp(['key']);
    expect(qp!.propName).toBe('q:p');
    expect(qp!.propValue).toBe('key');
  });
});
