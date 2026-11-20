import { runInNewContext } from 'node:vm';
import { describe, it, expect } from 'vitest';
import {
  analyzeSignalExpression,
  SignalHoister,
} from '../../../src/optimizer/jsx/signal-analysis.js';
import { parseExprWithSource as parseExpr } from '../helpers/parse-nodes.js';

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

    it('does NOT hoist useData().value into a _fnSignal (call must run in render scope)', () => {
      const { node, source } = parseExpr('useData().value');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result).toEqual({ type: 'wrapProp', code: '_wrapProp(useData())' });
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
        expect(result.hoistedFn).toBe('(p0)=>12 + p0.value');
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

    it('generates fnSignal for negated signal: !signal.value', () => {
      const { node, source } = parseExpr('!signal.value');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['signal']);
        expect(result.hoistedFn).toBe('(p0)=>!p0.value');
      }
    });

    it('keeps a property name out of the deps behind a non-null assertion: !o.shorten!.value', () => {
      const { node, source } = parseExpr('!o.shorten!.value');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['o']);
        expect(result.hoistedFn).toBe('(p0)=>!p0.shorten.value');
      }
    });

    it('keeps a property name out of the deps behind a cast: (o.shorten as Sig).value', () => {
      const { node, source } = parseExpr('(o.shorten as Sig).value');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['o']);
      }
    });

    it('keeps property names out of the deps behind a fallback: (o.a || o.b).shorten.value', () => {
      const { node, source } = parseExpr('(o.a || o.b).shorten.value');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['o']);
      }
    });

    it('keeps a type name out of the deps: (x as Sig) ? o.value : false', () => {
      const { node, source } = parseExpr('(x as Sig) ? o.value : false');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['o', 'x']);
      }
    });

    it('carries a variable used as a computed object key: { [name]: signal.value }', () => {
      const { node, source } = parseExpr('{ [name]: signal.value }');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['name', 'signal']);
        expect(result.hoistedStr).toBe('"{[p0]:p1.value}"');
      }
    });

    it('carries the object read in a computed object key: { [o.name]: signal.value }', () => {
      const { node, source } = parseExpr('{ [o.name]: signal.value }');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['o', 'signal']);
        expect(result.hoistedStr).toBe('"{[p0.name]:p1.value}"');
      }
    });

    it('carries a computed object key behind a fallback: (o.a || { [name]: flag }).shorten.value', () => {
      const { node, source } = parseExpr('(o.a || { [name]: flag }).shorten.value');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['flag', 'name', 'o']);
        expect(result.hoistedStr).toBe('"(p2.a||{[p1]:p0}).shorten.value"');
      }
    });

    it('leaves a module-scope computed object key free: { [MODULE_KEY]: signal.value }', () => {
      const { node, source } = parseExpr('{ [MODULE_KEY]: signal.value }');
      const localNames = new Set(['signal']);
      const result = analyzeSignalExpression(node, source, importedNames, localNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['signal']);
        expect(result.hoistedStr).toBe('"{[MODULE_KEY]:p0.value}"');
      }
    });

    it('keeps an object key named like a variable out of the deps: { name: signal.value }', () => {
      const { node, source } = parseExpr('{ name: signal.value }');
      const localNames = new Set(['name', 'signal']);
      const result = analyzeSignalExpression(node, source, importedNames, localNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['signal']);
        expect(result.hoistedStr).toBe('"{name:p0.value}"');
      }
    });

    it('does NOT hoist a non-reactive unary: !plainVar', () => {
      const { node, source } = parseExpr('!plainVar');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result.type).toBe('none');
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

    it.each(['store[dep()].name', '(store[dep()] as Item).name'])(
      'does not hoist a deep store chain that calls an import: %s',
      (expr) => {
        const { node, source } = parseExpr(expr);
        expect(analyzeSignalExpression(node, source, importedNames).type).toBe('none');
      }
    );

    it('generates fnSignal for ternary on deep store: store.address.city.name ? "true" : "false"', () => {
      const { node, source } = parseExpr("store.address.city.name ? 'true' : 'false'");
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['store']);
        expect(result.hoistedFn).toContain('p0.address.city.name');
        expect(result.hoistedStr).toContain('p0.address.city.name?');
        expect(result.hoistedStr).toContain('"true"');
        expect(result.hoistedStr).toContain('"false"');
      }
    });

    it('generates fnSignal with multiple signal deps: a.value + b.value', () => {
      const { node, source } = parseExpr('a.value + b.value');
      const result = analyzeSignalExpression(node, source, importedNames);
      expect(result.type).toBe('fnSignal');
      if (result.type === 'fnSignal') {
        expect(result.deps).toEqual(['a', 'b']);
        expect(result.hoistedFn).toBe('(p0,p1)=>p0.value + p1.value');
        expect(result.hoistedStr).toBe('"p0.value+p1.value"');
      }
    });

    it('string representation uses minimal whitespace', () => {
      const { node, source } = parseExpr('12 + signal.value');
      const result = analyzeSignalExpression(node, source, importedNames);
      if (result.type === 'fnSignal') {
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

    it.each([
      ['store[({ idx: idx }).idx].name', '(p0,p1)=>p1[({ idx: p0 }).idx].name'],
      ['store[({ idx }).idx].name', '(p0,p1)=>p1[({ idx: p0 }).idx].name'],
      ['store[({ idx }).idx]', '(p0,p1)=>p1[({ idx: p0 }).idx]'],
    ])('keeps object keys in a computed key when hoisting %s', (expr, hoistedFn) => {
      const { node, source } = parseExpr(expr);
      const localNames = new Set(['store', 'idx']);
      const result = analyzeSignalExpression(node, source, importedNames, localNames);
      expect(result.type === 'fnSignal' && result.hoistedFn).toBe(hoistedFn);
    });

    it('keeps a __proto__ shorthand key an own property when hoisting', () => {
      const expr = 'store[({ __proto__ }).__proto__].name';
      const { node, source } = parseExpr(expr);
      const localNames = new Set(['store', '__proto__']);
      const result = analyzeSignalExpression(node, source, importedNames, localNames);
      if (result.type !== 'fnSignal') {
        throw new Error(`expected fnSignal, got ${result.type}`);
      }
      const store = { chosen: { name: 'correct' }, '[object Object]': { name: 'wrong' } };
      const original = runInNewContext(`(store, __proto__) => ${expr}`)(store, 'chosen');
      const hoisted = runInNewContext(result.hoistedFn);
      const serialized = runInNewContext(`(p0, p1) => ${runInNewContext(result.hoistedStr)}`);
      expect(original).toBe('correct');
      expect(hoisted('chosen', store)).toBe(original);
      expect(serialized('chosen', store)).toBe(original);
    });

    it('hoists obj[42] (computed numeric literal)', () => {
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

    it('does NOT hoist obj[i] when obj is not a known local (needs an in-scope var)', () => {
      const { node, source } = parseExpr('unknownGlobal[i]');
      const localNames = new Set(['i']);
      const result = analyzeSignalExpression(node, source, importedNames, localNames);
      expect(result.type).toBe('none');
    });

    it('does NOT hoist when expression contains an unknown function call', () => {
      const { node, source } = parseExpr('arr[foo()]');
      const localNames = new Set(['arr']);
      const result = analyzeSignalExpression(node, source, importedNames, localNames);
      expect(result.type).toBe('none');
    });
  });
});
