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
  SignalHoister,
} from '../../../src/optimizer/jsx/signal-analysis.js';

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
        isStoreField: true,
      });
    });

    it('detects props["data-nu"] -> _wrapProp(props, "data-nu")', () => {
      const { node, source } = parseExpr("props['data-nu']");
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result).toEqual({
        type: 'wrapProp',
        code: '_wrapProp(props, "data-nu")',
        isStoreField: true,
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

  describe('_fnSignal generation', () => {
    const importedNames = new Set(['dep', 'mutable', 'Cmp']);

    it('generates fnSignal for 12 + signal.value', () => {
      const { node, source } = parseExpr('12 + signal.value');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['signal']);
        // hoistedFn preserves original whitespace
        expect(result.hoistedFn).toBe('(p0)=>12 + p0.value');
        // hoistedStr removes whitespace
        expect(result.hoistedStr).toBe('"12+p0.value"');
      }
    });

    it('generates fnSignal for ternary: signal.value > 0 ? "yes" : "no"', () => {
      const { node, source } = parseExpr('signal.value > 0 ? "yes" : "no"');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['signal']);
        expect(result.hoistedFn).toContain('p0.value');
        expect(result.hoistedFn).toContain('?');
      }
    });

    it('generates fnSignal for deep store access: store.address.city.name', () => {
      const { node, source } = parseExpr('store.address.city.name');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['store']);
        expect(result.hoistedFn).toBe('(p0)=>p0.address.city.name');
        expect(result.hoistedStr).toBe('"p0.address.city.name"');
      }
    });

    it('generates fnSignal for ternary on deep store: store.address.city.name ? "true" : "false"', () => {
      const { node, source } = parseExpr("store.address.city.name ? 'true' : 'false'");
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['store']);
        expect(result.hoistedFn).toContain('p0.address.city.name');
        // String representation preserves source quotes and removes whitespace
        expect(result.hoistedStr).toContain("p0.address.city.name?");
        expect(result.hoistedStr).toContain("'true'");
        expect(result.hoistedStr).toContain("'false'");
      }
    });

    it('generates fnSignal with multiple signal deps: a.value + b.value', () => {
      const { node, source } = parseExpr('a.value + b.value');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['a', 'b']);
        // hoistedFn preserves original whitespace
        expect(result.hoistedFn).toBe('(p0,p1)=>p0.value + p1.value');
        // hoistedStr removes whitespace
        expect(result.hoistedStr).toBe('"p0.value+p1.value"');
      }
    });

    it('string representation uses minimal whitespace', () => {
      const { node, source } = parseExpr('12 + signal.value');
      const result = analyzeSignalExpression(node, source, importedNames);
      if (result.type === 'fnSignal') {
        // No spaces around operators
        expect(result.hoistedStr).not.toContain(' + ');
        expect(result.hoistedStr).not.toContain(' - ');
      }
    });
  });

  describe('SignalHoister', () => {
    it('generates _hf0, _hf1, _hf2 names sequentially', () => {
      const hoister = new SignalHoister();
      expect(hoister.hoist('(p0)=>12+p0.value', '"12+p0.value"')).toBe('_hf0');
      expect(hoister.hoist('(p0)=>p0.name', '"p0.name"')).toBe('_hf1');
      expect(hoister.hoist('(p0,p1)=>p0.value+p1.value', '"p0.value+p1.value"')).toBe('_hf2');
    });

    it('generates correct _hfN and _hfN_str declarations', () => {
      const hoister = new SignalHoister();
      hoister.hoist('(p0)=>12+p0.value', '"12+p0.value"');
      hoister.hoist('(p0)=>p0.name', '"p0.name"');
      const decls = hoister.getDeclarations();
      expect(decls).toEqual([
        'const _hf0 = (p0)=>12+p0.value;',
        'const _hf0_str = "12+p0.value";',
        'const _hf1 = (p0)=>p0.name;',
        'const _hf1_str = "p0.name";',
      ]);
    });
  });

  // Computed MemberExpression with non-literal property emits
  // _fnSignal. Matches SWC's convert_inlined_fn path for `results[i]` /
  // `obj[key]` / `obj[42]` inside loop callbacks.
  describe('analyzeMemberExpression — computed non-literal property', () => {
    const importedNames = new Set<string>();

    it('hoists results[i] to _fnSignal((p0,p1)=>p1[p0], [i, results], "p1[p0]")', () => {
      const { node, source } = parseExpr('results[i]');
      const localNames = new Set(['results', 'i']);
      const result = analyzeSignalExpression(node, source, importedNames, localNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['i', 'results']);
        expect(result.hoistedFn).toBe('(p0,p1)=>p1[p0]');
        expect(result.hoistedStr).toBe('"p1[p0]"');
      }
    });

    it('hoists obj[key] (for-in pattern) — same shape with different dep names', () => {
      const { node, source } = parseExpr('obj[key]');
      const localNames = new Set(['obj', 'key']);
      const result = analyzeSignalExpression(node, source, importedNames, localNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['key', 'obj']);
        expect(result.hoistedFn).toBe('(p0,p1)=>p1[p0]');
      }
    });

    it('hoists obj[42] (computed numeric literal — SWC also hoists this case)', () => {
      const { node, source } = parseExpr('obj[42]');
      const localNames = new Set(['obj']);
      const result = analyzeSignalExpression(node, source, importedNames, localNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['obj']);
        expect(result.hoistedFn).toBe('(p0)=>p0[42]');
      }
    });

    it('does NOT regress obj["string"] — still wrapProp via isStoreFieldAccess (literal-string fast path)', () => {
      const { node, source } = parseExpr('obj["field"]');
      const localNames = new Set(['obj']);
      const result = analyzeSignalExpression(node, source, importedNames, localNames);
      expect(result.type).toBe('wrapProp');
      if (result.type === 'wrapProp') {
        expect(result.code).toBe('_wrapProp(obj, "field")');
        expect(result.isStoreField).toBe(true);
      }
    });

    it('does NOT hoist obj[i] when obj is not a known local (matches SWC: needs in-scope Var)', () => {
      // Unknown global / unbound name — the localNames-aware gate filters
      // out names we can't resolve, matching SWC's decl_stack check.
      const { node, source } = parseExpr('unknownGlobal[i]');
      const localNames = new Set(['i']); // intentionally excludes unknownGlobal
      const result = analyzeSignalExpression(node, source, importedNames, localNames);
      expect(result.type).toBe('none');
    });

    it('does NOT hoist when expression contains an unknown function call', () => {
      // The containsUnknownCall blocker fires for `arr[foo()]` where foo is
      // not imported — matches SWC's used_as_call gate.
      const { node, source } = parseExpr('arr[foo()]');
      const localNames = new Set(['arr']);
      const result = analyzeSignalExpression(node, source, importedNames, localNames);
      expect(result.type).toBe('none');
    });
  });
});
