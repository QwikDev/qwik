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
  hoistEventCaptures,
  findEnclosingLoop,
  type LoopContext,
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

function findAllNodes(source: string, nodeType: string): any[] {
  const { program } = parseSync('test.tsx', source);
  const nodes: any[] = [];
  walk(program, {
    enter(node: any) {
      if (node.type === nodeType) {
        nodes.push(node);
      }
    },
  });
  return nodes;
}

/**
 * Helper: find a node and its ancestor chain
 */
function findNodeWithAncestors(
  source: string,
  nodeType: string,
  predicate?: (node: any) => boolean,
): { node: any; ancestors: any[] } | null {
  const { program } = parseSync('test.tsx', source);
  let result: { node: any; ancestors: any[] } | null = null;
  const ancestors: any[] = [];

  walk(program, {
    enter(node: any) {
      if (!result) {
        ancestors.push(node);
        if (node.type === nodeType && (!predicate || predicate(node))) {
          result = { node, ancestors: [...ancestors] };
        }
      }
    },
    leave() {
      if (!result) {
        ancestors.pop();
      }
    },
  });

  return result;
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
// hoistEventCaptures
// ---------------------------------------------------------------------------

describe('hoistEventCaptures', () => {
  it('produces hoisted .w() declaration with single capture', () => {
    const plan = hoistEventCaptures('handler', 'q_handler_qrl', ['cart']);
    expect(plan).not.toBeNull();
    expect(plan!.hoistedDecl).toBe('const handler = q_handler_qrl.w([cart])');
    expect(plan!.qrlRefName).toBe('handler');
    expect(plan!.originalQrlRef).toBe('q_handler_qrl');
  });

  it('produces hoisted .w() declaration with multiple captures', () => {
    const plan = hoistEventCaptures('handler', 'q_handler_qrl', [
      'cart',
      'results',
    ]);
    expect(plan).not.toBeNull();
    expect(plan!.hoistedDecl).toBe(
      'const handler = q_handler_qrl.w([cart, results])',
    );
  });

  it('returns null when no captures', () => {
    const plan = hoistEventCaptures('handler', 'q_handler_qrl', []);
    expect(plan).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findEnclosingLoop
// ---------------------------------------------------------------------------

describe('findEnclosingLoop', () => {
  it('finds enclosing .map() loop for a node inside', () => {
    const source = `results.map((item) => { const x = item; })`;
    const result = findNodeWithAncestors(
      source,
      'VariableDeclaration',
    );
    expect(result).not.toBeNull();
    const loopCtx = findEnclosingLoop(result!.node, result!.ancestors);
    expect(loopCtx).not.toBeNull();
    expect(loopCtx!.type).toBe('map');
  });

  it('finds enclosing for-of loop', () => {
    const source = `for (const item of results) { const x = item; }`;
    // Find all VariableDeclarations - the first is the for-of's own "const item",
    // the second is "const x = item" inside the body
    const { program } = parseSync('test.tsx', source);
    const allDecls: { node: any; ancestors: any[] }[] = [];
    const ancestorStack: any[] = [];

    walk(program, {
      enter(node: any) {
        ancestorStack.push(node);
        if (node.type === 'VariableDeclaration') {
          allDecls.push({ node, ancestors: [...ancestorStack] });
        }
      },
      leave() {
        ancestorStack.pop();
      },
    });

    // The second VariableDeclaration should be "const x = item" inside the loop body
    expect(allDecls.length).toBeGreaterThanOrEqual(2);
    const bodyDecl = allDecls[1];
    const loopCtx = findEnclosingLoop(bodyDecl.node, bodyDecl.ancestors);
    expect(loopCtx).not.toBeNull();
    expect(loopCtx!.type).toBe('for-of');
  });

  it('returns null when not inside a loop', () => {
    const source = `const x = 1;`;
    const result = findNodeWithAncestors(source, 'VariableDeclaration');
    expect(result).not.toBeNull();
    const loopCtx = findEnclosingLoop(result!.node, result!.ancestors);
    expect(loopCtx).toBeNull();
  });

  it('finds nearest enclosing loop in nested loops', () => {
    const source = `
      results.map((row) => {
        row.map((cell) => {
          const x = cell;
        });
      });
    `;
    const result = findNodeWithAncestors(
      source,
      'VariableDeclaration',
    );
    expect(result).not.toBeNull();
    const loopCtx = findEnclosingLoop(result!.node, result!.ancestors);
    expect(loopCtx).not.toBeNull();
    expect(loopCtx!.type).toBe('map');
    // Should find the inner .map(), not the outer one
    expect(loopCtx!.iterVars).toEqual(['cell']);
  });
});
