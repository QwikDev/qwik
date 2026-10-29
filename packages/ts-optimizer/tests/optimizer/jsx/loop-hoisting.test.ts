import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { walk } from 'oxc-walker';
import type { AstNode } from '../../../src/ast-types.js';
import {
  detectLoopContext,
  generateParamPadding,
  buildCaptureProp,
  eventHandlerQpParams,
  insertLoopWDecls,
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
  if (!found) {
    throw new Error(`No ${nodeType} node found in source`);
  }
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

  it('returns [] for one- or two-param lists (never promoted)', () => {
    expect(eventHandlerQpParams(['ev'])).toEqual([]);
    expect(eventHandlerQpParams(['_'])).toEqual([]);
    expect(eventHandlerQpParams(['ev', 'elm'])).toEqual([]);
  });

  it('keeps author-written event/element params out of the capture list', () => {
    // Promotion preserves original params in the first two slots.
    expect(eventHandlerQpParams(['event', 'element', 'item'])).toEqual(['item']);
    expect(eventHandlerQpParams(['ev', '_1', 'store'])).toEqual(['store']);
  });

  it('returns [] for a bare `_, _1` prefix with no capture params', () => {
    expect(eventHandlerQpParams(['_', '_1'])).toEqual([]);
  });

  it('returns capture params after the prefix in positional order', () => {
    expect(eventHandlerQpParams(['_', '_1', 'item'])).toEqual(['item']);
    expect(eventHandlerQpParams(['_', '_1', 'item', 'idx'])).toEqual(['item', 'idx']);
  });

  it('skips numbered padding params from unused slots', () => {
    expect(eventHandlerQpParams(['_', '_1', '_2', 'idx'])).toEqual(['idx']);
    expect(eventHandlerQpParams(['_', '_1', 'item', '_3', 'key'])).toEqual(['item', 'key']);
    expect(eventHandlerQpParams(['_', '_1', '_2', '_3'])).toEqual([]);
  });

  it('skips a bare `_` param past the prefix', () => {
    expect(eventHandlerQpParams(['_', '_1', '_'])).toEqual([]);
    expect(eventHandlerQpParams(['_', '_1', '_', 'item'])).toEqual(['item']);
    expect(eventHandlerQpParams(['_', '_1', 'item', '_'])).toEqual(['item']);
  });

  it('keeps underscore-prefixed identifiers that are not padding-shaped', () => {
    expect(eventHandlerQpParams(['_', '_1', '_foo', '_bar2'])).toEqual(['_foo', '_bar2']);
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

describe('insertLoopWDecls', () => {
  const binding = { decl: 'const h = q_h.w([p]);', symbolName: 'h', captureNames: ['p'] };

  it('places the binding inside the function body', () => {
    expect(insertLoopWDecls('(p) => <b onClick$={h} />', [binding])).toMatch(
      /^\(p\) => \{\s*const h = q_h\.w\(\[p\]\);\s*return <b onClick\$=\{h\} \/>;\s*\}$/
    );
  });

  it('places the binding at its reference, not at an earlier string with the same text', () => {
    const outerItemBinding = {
      decl: 'const h = q_h.w([f]);',
      symbolName: 'h',
      captureNames: ['f'],
    };
    const body =
      '(p) => <div title="h">{p.map((f) => f.items.map(() => <b onClick$={h} />))}</div>';
    expect(insertLoopWDecls(body, [outerItemBinding])).toMatch(
      /^\(p\) => <div title="h">\{p\.map\(\(f\) => \{\s*const h = q_h\.w\(\[f\]\);/
    );
  });

  it('places the binding after statements that reassign a capture', () => {
    const reassignedBinding = {
      decl: 'const h = q_h.w([x]);',
      symbolName: 'h',
      captureNames: ['x'],
    };
    const body = "(p) => { let x = p.a; x = 'b'; return <b onClick$={h} />; }";
    expect(insertLoopWDecls(body, [reassignedBinding])).toMatch(
      /x = 'b';\s*const h = q_h\.w\(\[x\]\);\s*return/
    );
  });

  it('places the binding before a declaration that uses it', () => {
    const body =
      '(p) => { const rows = p.map(() => <b onClick$={h} />); const t = 1; return rows; }';
    expect(insertLoopWDecls(body, [binding])).toMatch(
      /^\(p\) => \{\s*const h = q_h\.w\(\[p\]\);\s*const rows =/
    );
  });

  it('places the binding before calls to a function declared after them', () => {
    const body =
      '(p) => { return render(); function render() { return p.map(() => <b onClick$={h} />); } }';
    expect(insertLoopWDecls(body, [binding])).toMatch(
      /^\(p\) => \{\s*const h = q_h\.w\(\[p\]\);\s*return render\(\);/
    );
  });

  it('places the binding before JSX tags of a function declared after them', () => {
    const body =
      '(p) => { return <ul><Rows /></ul>; function Rows() { return p.map(() => <b onClick$={h} />); } }';
    expect(insertLoopWDecls(body, [binding])).toMatch(
      /^\(p\) => \{\s*const h = q_h\.w\(\[p\]\);\s*return <ul>/
    );
  });

  it('places the binding after a capture declared below its first use', () => {
    const laterCaptureBinding = {
      decl: 'const h = q_h.w([x]);',
      symbolName: 'h',
      captureNames: ['x'],
    };
    const body =
      '(p) => { const render = () => p.map(() => <b onClick$={h} />); const x = p.a; return render(); }';
    expect(insertLoopWDecls(body, [laterCaptureBinding])).toMatch(
      /const x = p\.a;\s*const h = q_h\.w\(\[x\]\);\s*return render\(\);/
    );
  });

  it('throws instead of dropping the binding when the body is not a function', () => {
    expect(() => insertLoopWDecls('items', [binding])).toThrow(/Qwik optimizer: .* h\b/);
  });

  it('throws instead of dropping the binding when nothing uses it', () => {
    expect(() => insertLoopWDecls('(p) => <b />', [binding])).toThrow(/Qwik optimizer: .* h\b/);
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
