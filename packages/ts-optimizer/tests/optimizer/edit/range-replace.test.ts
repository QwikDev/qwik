import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import {
  collectRangeReplacements,
  expressionNeedsParens,
  isReplaceableIdentifierPosition,
  type RangeReplacement,
  type RangeReplacementCollector,
} from '../../../src/optimizer/edit/range-replace.js';
import { applyReplacements } from '../../../src/optimizer/jsx/simplify.js';
import type { AstNode, AstParentNode } from '../../../src/ast-types.js';

function parseExpr(src: string): AstNode {
  const wrapped = `const __e__ = ${src};`;
  const parsed = parseSync('__expr__.ts', wrapped);
  const decl = (parsed.program?.body?.[0] as { declarations?: Array<{ init?: AstNode }> })
    ?.declarations?.[0];
  if (!decl?.init) throw new Error('parse failed');
  return decl.init;
}

describe('collectRangeReplacements', () => {
  it('returns an empty list when no collectors are registered', () => {
    const expr = parseExpr('foo + bar');
    const out = collectRangeReplacements(expr, expr.start, 'foo + bar', []);
    expect(out).toEqual([]);
  });

  it('runs every collector at every node', () => {
    const expr = parseExpr('1 + 2');
    const visits: Array<string> = [];
    const trace: RangeReplacementCollector = (n) => {
      visits.push(n.type);
      return null;
    };
    collectRangeReplacements(expr, expr.start, '1 + 2', [trace, trace]);
    expect(visits.length).toBe(6);
    expect(visits.filter((t) => t === 'BinaryExpression').length).toBe(2);
    expect(visits.filter((t) => t === 'Literal').length).toBe(4);
  });

  it('threads parentKey + parentNode to the collector', () => {
    const expr = parseExpr('a + b');
    const captured: Array<{ name?: string; parentKey?: string; parentType?: string }> = [];
    const captureIdents: RangeReplacementCollector = (n, ctx) => {
      if (n.type === 'Identifier') {
        captured.push({
          name: n.name,
          parentKey: ctx.parentKey,
          parentType: ctx.parentNode?.type,
        });
      }
      return null;
    };
    collectRangeReplacements(expr, expr.start, 'a + b', [captureIdents]);
    expect(captured).toEqual([
      { name: 'a', parentKey: 'left', parentType: 'BinaryExpression' },
      { name: 'b', parentKey: 'right', parentType: 'BinaryExpression' },
    ]);
  });

  it('skipSubtree from a collector suppresses recursion for all collectors', () => {
    const expr = parseExpr('1 + 2');
    const visitsA: Array<string> = [];
    const visitsB: Array<string> = [];
    const skipOuter: RangeReplacementCollector = (n) => {
      visitsA.push(n.type);
      if (n.type === 'BinaryExpression') {
        return { replacements: [], skipSubtree: true };
      }
      return null;
    };
    const trace: RangeReplacementCollector = (n) => {
      visitsB.push(n.type);
      return null;
    };
    collectRangeReplacements(expr, expr.start, '1 + 2', [skipOuter, trace]);
    expect(visitsA).toEqual(['BinaryExpression']);
    expect(visitsB).toEqual(['BinaryExpression']);
  });

  it('skipSubtree triggered by ANY collector suppresses recursion for ALL', () => {
    const expr = parseExpr('1 + 2');
    const childVisitsA: Array<string> = [];
    const childVisitsB: Array<string> = [];
    const skipAtBinary: RangeReplacementCollector = (n) => {
      if (n.type === 'BinaryExpression') return { replacements: [], skipSubtree: true };
      return null;
    };
    const traceA: RangeReplacementCollector = (n) => {
      if (n.type === 'Literal') childVisitsA.push(String(n.value));
      return null;
    };
    const traceB: RangeReplacementCollector = (n) => {
      if (n.type === 'Literal') childVisitsB.push(String(n.value));
      return null;
    };
    collectRangeReplacements(expr, expr.start, '1 + 2', [skipAtBinary, traceA, traceB]);
    expect(childVisitsA).toEqual([]);
    expect(childVisitsB).toEqual([]);
  });

  it('collects replacements from multiple collectors disjointly', () => {
    const expr = parseExpr('a + b');
    const text = 'a + b';
    const renameIdents: RangeReplacementCollector = (n, ctx) => {
      if (n.type === 'Identifier' && (n.name === 'a' || n.name === 'b')) {
        return {
          replacements: [
            {
              start: n.start - ctx.exprStart,
              end: n.end - ctx.exprStart,
              replacement: n.name === 'a' ? 'p0' : 'p1',
            },
          ],
        };
      }
      return null;
    };
    const out = collectRangeReplacements(expr, expr.start, text, [renameIdents]);
    expect(out.length).toBe(2);
    expect(applyReplacements(text, out)).toBe('p0 + p1');
  });

  it('does not call collectors on null/undefined nodes', () => {
    const visits: string[] = [];
    const trace: RangeReplacementCollector = (n) => {
      visits.push(n.type);
      return null;
    };
    collectRangeReplacements(null, 0, '', [trace]);
    expect(visits).toEqual([]);
  });
});

describe('isReplaceableIdentifierPosition', () => {
  it('returns false for property keys', () => {
    const parent = { type: 'Property' } as AstParentNode;
    expect(isReplaceableIdentifierPosition('key', parent)).toBe(false);
  });

  it('returns false for non-computed member access property', () => {
    const parent = { type: 'MemberExpression', computed: false } as unknown as AstParentNode;
    expect(isReplaceableIdentifierPosition('property', parent)).toBe(false);
  });

  it('returns TRUE for computed member access property (rewrite is safe)', () => {
    const parent = { type: 'MemberExpression', computed: true } as unknown as AstParentNode;
    expect(isReplaceableIdentifierPosition('property', parent)).toBe(true);
  });

  it('returns false for function parameter position', () => {
    expect(isReplaceableIdentifierPosition('params', undefined)).toBe(false);
  });

  it('returns false for declarator id', () => {
    const parent = { type: 'VariableDeclarator' } as AstParentNode;
    expect(isReplaceableIdentifierPosition('id', parent)).toBe(false);
  });

  it('returns true for shorthand property value (caller handles shorthand emit)', () => {
    const parent = { type: 'Property', shorthand: true } as unknown as AstParentNode;
    expect(isReplaceableIdentifierPosition('value', parent)).toBe(true);
  });

  it('returns true for binary operand position (the common reference case)', () => {
    const parent = { type: 'BinaryExpression' } as AstParentNode;
    expect(isReplaceableIdentifierPosition('left', parent)).toBe(true);
    expect(isReplaceableIdentifierPosition('right', parent)).toBe(true);
  });

  it('returns true at root (no parent)', () => {
    expect(isReplaceableIdentifierPosition(undefined, undefined)).toBe(true);
  });
});

describe('expressionNeedsParens', () => {
  it('returns true for BinaryExpression operand (any side)', () => {
    const parent = { type: 'BinaryExpression' } as AstParentNode;
    expect(expressionNeedsParens('left', parent)).toBe(true);
    expect(expressionNeedsParens('right', parent)).toBe(true);
  });

  it('returns true for LogicalExpression operand (?? + ||/&& mixing is a syntax error)', () => {
    const parent = { type: 'LogicalExpression' } as AstParentNode;
    expect(expressionNeedsParens('left', parent)).toBe(true);
    expect(expressionNeedsParens('right', parent)).toBe(true);
  });

  it('returns true for UnaryExpression argument', () => {
    const parent = { type: 'UnaryExpression' } as AstParentNode;
    expect(expressionNeedsParens('argument', parent)).toBe(true);
  });

  it('returns true for UpdateExpression argument', () => {
    const parent = { type: 'UpdateExpression' } as AstParentNode;
    expect(expressionNeedsParens('argument', parent)).toBe(true);
  });

  it('returns true for MemberExpression object position only', () => {
    const parent = { type: 'MemberExpression' } as AstParentNode;
    expect(expressionNeedsParens('object', parent)).toBe(true);
    expect(expressionNeedsParens('property', parent)).toBe(false);
  });

  it('returns true for TaggedTemplateExpression tag', () => {
    const parent = { type: 'TaggedTemplateExpression' } as AstParentNode;
    expect(expressionNeedsParens('tag', parent)).toBe(true);
  });

  it('returns true for CallExpression / NewExpression callee', () => {
    const callParent = { type: 'CallExpression' } as AstParentNode;
    const newParent = { type: 'NewExpression' } as AstParentNode;
    expect(expressionNeedsParens('callee', callParent)).toBe(true);
    expect(expressionNeedsParens('callee', newParent)).toBe(true);
  });

  it('returns false for CallExpression / NewExpression arguments', () => {
    const parent = { type: 'CallExpression' } as AstParentNode;
    expect(expressionNeedsParens('arguments', parent)).toBe(false);
  });

  it('returns false for ObjectExpression Property value position', () => {
    const parent = { type: 'Property' } as AstParentNode;
    expect(expressionNeedsParens('value', parent)).toBe(false);
  });

  it('returns false for ArrayExpression element position', () => {
    const parent = { type: 'ArrayExpression' } as AstParentNode;
    expect(expressionNeedsParens('elements', parent)).toBe(false);
  });

  it('returns false for ConditionalExpression branches (?: lower precedence than ??)', () => {
    const parent = { type: 'ConditionalExpression' } as AstParentNode;
    expect(expressionNeedsParens('test', parent)).toBe(false);
    expect(expressionNeedsParens('consequent', parent)).toBe(false);
    expect(expressionNeedsParens('alternate', parent)).toBe(false);
  });

  it('returns false for AssignmentExpression right side', () => {
    const parent = { type: 'AssignmentExpression' } as AstParentNode;
    expect(expressionNeedsParens('right', parent)).toBe(false);
  });

  it('returns false for ReturnStatement argument', () => {
    const parent = { type: 'ReturnStatement' } as AstParentNode;
    expect(expressionNeedsParens('argument', parent)).toBe(false);
  });

  it('returns false for VariableDeclarator init', () => {
    const parent = { type: 'VariableDeclarator' } as AstParentNode;
    expect(expressionNeedsParens('init', parent)).toBe(false);
  });

  it('returns false for JSXExpressionContainer expression', () => {
    const parent = { type: 'JSXExpressionContainer' } as AstParentNode;
    expect(expressionNeedsParens('expression', parent)).toBe(false);
  });

  it('returns false for TemplateLiteral expression slot', () => {
    const parent = { type: 'TemplateLiteral' } as AstParentNode;
    expect(expressionNeedsParens('expressions', parent)).toBe(false);
  });

  it('returns false for ExpressionStatement', () => {
    const parent = { type: 'ExpressionStatement' } as AstParentNode;
    expect(expressionNeedsParens('expression', parent)).toBe(false);
  });

  it('returns false for ParenthesizedExpression (already inside parens)', () => {
    const parent = { type: 'ParenthesizedExpression' } as AstParentNode;
    expect(expressionNeedsParens('expression', parent)).toBe(false);
  });

  it('returns false at root (no parent)', () => {
    expect(expressionNeedsParens(undefined, undefined)).toBe(false);
  });
});
