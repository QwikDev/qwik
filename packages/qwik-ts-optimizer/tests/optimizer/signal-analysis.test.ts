/**
 * Tests for signal analysis module.
 *
 * Verifies detection of signal.value and store.field patterns for _wrapProp,
 * and correct identification of non-wrap conditions per SIG-05.
 */

import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import {
  analyzeSignalExpression,
  isSignalValueAccess,
  isStoreFieldAccess,
} from '../../src/optimizer/signal-analysis.js';

/**
 * Helper: parse an expression string into an AST expression node.
 * Wraps the expression in a variable declaration to get a valid program.
 */
function parseExpr(expr: string): { node: any; source: string } {
  const source = `const __x = ${expr};`;
  const { program } = parseSync('test.tsx', source);
  const decl = program.body[0] as any;
  // VariableDeclaration -> declarations[0] -> init
  return { node: decl.declarations[0].init, source };
}

describe('signal-analysis', () => {
  describe('analyzeSignalExpression', () => {
    const importedNames = new Set(['dep', 'mutable', 'Cmp']);

    it('detects signal.value -> _wrapProp(signal)', () => {
      const { node, source } = parseExpr('signal.value');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result).toEqual({ type: 'wrapProp', code: '_wrapProp(signal)' });
    });

    it('detects props.class -> _wrapProp(props, "class")', () => {
      const { node, source } = parseExpr('props.class');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result).toEqual({
        type: 'wrapProp',
        code: '_wrapProp(props, "class")',
      });
    });

    it('detects props["data-nu"] -> _wrapProp(props, "data-nu")', () => {
      const { node, source } = parseExpr("props['data-nu']");
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result).toEqual({
        type: 'wrapProp',
        code: '_wrapProp(props, "data-nu")',
      });
    });

    it('does NOT wrap signal.value() (function call on .value)', () => {
      const { node, source } = parseExpr('signal.value()');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result).toEqual({ type: 'none' });
    });

    it('does NOT wrap signal.value + unknown() (mixed with unknown call)', () => {
      const { node, source } = parseExpr('signal.value + unknown()');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result).toEqual({ type: 'none' });
    });

    it('does NOT wrap mutable(signal) (explicit mutable)', () => {
      const { node, source } = parseExpr('mutable(signal)');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result).toEqual({ type: 'none' });
    });

    it('does NOT wrap string literals', () => {
      const { node, source } = parseExpr('"literal"');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result).toEqual({ type: 'none' });
    });

    it('does NOT wrap imported references', () => {
      const { node, source } = parseExpr('dep');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result).toEqual({ type: 'none' });
    });

    it('does NOT wrap signal.value + dep (mixed signal.value with import)', () => {
      const { node, source } = parseExpr('signal.value + dep');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result).toEqual({ type: 'none' });
    });

    it('does NOT wrap bare signal reference (no .value)', () => {
      const { node, source } = parseExpr('signal');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result).toEqual({ type: 'none' });
    });
  });

  describe('isSignalValueAccess', () => {
    it('returns true for x.value', () => {
      const { node } = parseExpr('signal.value');
      expect(isSignalValueAccess(node)).toBe(true);
    });

    it('returns false for x.other', () => {
      const { node } = parseExpr('signal.other');
      expect(isSignalValueAccess(node)).toBe(false);
    });

    it('returns false for non-MemberExpression', () => {
      const { node } = parseExpr('"hello"');
      expect(isSignalValueAccess(node)).toBe(false);
    });
  });

  describe('isStoreFieldAccess', () => {
    const importedNames = new Set(['dep']);

    it('returns true for props.class (local obj, non-.value field)', () => {
      const { node } = parseExpr('props.class');
      expect(isStoreFieldAccess(node, importedNames)).toBe(true);
    });

    it('returns false for dep.thing (imported obj)', () => {
      const { node } = parseExpr('dep.thing');
      expect(isStoreFieldAccess(node, importedNames)).toBe(false);
    });

    it('returns false for signal.value (signal access, not store field)', () => {
      const { node } = parseExpr('signal.value');
      expect(isStoreFieldAccess(node, importedNames)).toBe(false);
    });

    it('returns false for non-MemberExpression', () => {
      const { node } = parseExpr('42');
      expect(isStoreFieldAccess(node, importedNames)).toBe(false);
    });
  });
});
