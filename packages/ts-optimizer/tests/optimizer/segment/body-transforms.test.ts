import { describe, expect, it } from 'vitest';
import {
  applySelfRefIndirection,
  ensureCoreImports,
  injectCapturesUnpacking,
  rewriteFunctionSignature,
  rewriteNestedCallSitesInline,
} from '../../../src/optimizer/segment/body-transforms.js';
import type { NestedCallSiteInfo } from '../../../src/optimizer/segment/segment-codegen.js';

describe('body-transforms', () => {
  describe('rewriteFunctionSignature', () => {
    it('rewrites single-param arrow signatures through the shared function session', () => {
      expect(rewriteFunctionSignature('value => value + 1', ['props', 'state'])).toBe(
        '(props, state) => value + 1'
      );
    });

    it('rewrites zero-param arrow signatures without reparsing edited output', () => {
      expect(rewriteFunctionSignature('() => 1', ['props'])).toBe('(props) => 1');
    });

    it('rewrites function expression signatures through AST positions', () => {
      expect(rewriteFunctionSignature('function named() { return 1; }', ['props', 'key'])).toBe(
        'function named(props, key) { return 1; }'
      );
    });
  });

  describe('injectCapturesUnpacking', () => {
    it('injects captures into block bodies via the shared function session', () => {
      expect(injectCapturesUnpacking('(props) => {\n  return props.count;\n}', ['count'])).toBe(
        '(props) => {\nconst count = _captures[0];\n  return props.count;\n}'
      );
    });

    it('converts expression bodies to block bodies when injecting captures', () => {
      expect(injectCapturesUnpacking('(props) => props.count + 1', ['count', 'label'])).toBe(
        '(props) => {\nconst count = _captures[0], label = _captures[1];\nreturn props.count + 1;\n}'
      );
    });
  });

  describe('applySelfRefIndirection', () => {
    it('rewrites self-referential const declarators', () => {
      const output = applySelfRefIndirection(
        '() => {\n  const x = call(q_abc.w([x]));\n  return x;\n}'
      );
      const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
      expect(normalize(output)).toBe(
        normalize(`() => {
        const _ref = {};
        _ref.x = call(q_abc.w([_ref.x]));
        const { x } = _ref;
        return x;
      }`)
      );
    });

    it('does not rewrite non-const self-referential declarators', () => {
      expect(
        applySelfRefIndirection('() => {\n  let x = call(q_abc.w([x]));\n  return x;\n}')
      ).toBe('() => {\n  let x = call(q_abc.w([x]));\n  return x;\n}');
    });

    it('does not rewrite var self-referential declarators', () => {
      expect(
        applySelfRefIndirection('() => {\n  var x = call(q_abc.w([x]));\n  return x;\n}')
      ).toBe('() => {\n  var x = call(q_abc.w([x]));\n  return x;\n}');
    });

    it('does not rewrite non-qrl .w() calls', () => {
      expect(
        applySelfRefIndirection('() => {\n  const x = call(worker.w([x]));\n  return x;\n}')
      ).toBe('() => {\n  const x = call(worker.w([x]));\n  return x;\n}');
    });
  });

  describe('ensureCoreImports', () => {
    it('inserts a referenced core symbol import before the // separator', () => {
      const parts = ['//', 'return _jsxSorted("div", null, null, null, 1, "k")'];
      ensureCoreImports(parts[1]!, parts);
      expect(parts).toEqual([
        'import { _jsxSorted } from "@qwik.dev/core";',
        '//',
        'return _jsxSorted("div", null, null, null, 1, "k")',
      ]);
    });

    it('routes _Fragment to the jsx-runtime import', () => {
      const parts = ['//', 'return _Fragment'];
      ensureCoreImports(parts[1]!, parts);
      expect(parts[0]).toBe('import { Fragment as _Fragment } from "@qwik.dev/core/jsx-runtime";');
    });

    it('does not re-add a core symbol that is already imported', () => {
      const parts = ['import { _jsxSorted } from "@qwik.dev/core";', '//', 'return _jsxSorted()'];
      ensureCoreImports(parts[2]!, parts);
      expect(parts).toEqual([
        'import { _jsxSorted } from "@qwik.dev/core";',
        '//',
        'return _jsxSorted()',
      ]);
    });

    it('does not add a core symbol the body never references', () => {
      const parts = ['//', 'return 1'];
      ensureCoreImports(parts[1]!, parts);
      expect(parts).toEqual(['//', 'return 1']);
    });
  });

  describe('rewriteNestedCallSitesInline scanner robustness', () => {
    const attrText = 'onClick$={PLACEHOLDER}';
    const hoistedAttrSite = (
      body: string,
      qrlVarName: string,
      hoistedSymbolName: string,
      capture: string
    ): NestedCallSiteInfo => {
      const attrStart = body.indexOf(attrText);
      return {
        qrlVarName,
        callStart: attrStart,
        callEnd: attrStart + attrText.length,
        isJsxAttr: true,
        attrStart,
        attrEnd: attrStart + attrText.length,
        transformedPropName: 'onClick$',
        hoistedSymbolName,
        hoistedCaptureNames: [capture],
      };
    };

    it('finds the component return past a comment with an apostrophe', () => {
      const body = `() => {
    const msg = state.msg;
    // don't break the scanner
    return <button ${attrText}>x</button>;
}`;
      const out = rewriteNestedCallSitesInline(
        body,
        [hoistedAttrSite(body, 'q_h', '_hw1', 'msg')],
        0
      );
      expect(out).toContain('onClick$={_hw1}');
      const declPos = out.indexOf('const _hw1 = q_h.w([');
      expect(declPos).toBeGreaterThanOrEqual(0);
      expect(declPos).toBeLessThan(out.indexOf('return <button'));
    });

    it('ends a capture declaration at its statement, not a nested arrow semicolon', () => {
      const body = `() => {
    return items.map((item) => {
        const derived = item.list.filter((x) => { use(x); return x.ok; });
        return <li ${attrText}>t</li>;
    });
}`;
      const out = rewriteNestedCallSitesInline(
        body,
        [hoistedAttrSite(body, 'q_c', '_hw2', 'derived')],
        0
      );
      const declPos = out.indexOf('const _hw2 = q_c.w([');
      expect(declPos).toBeGreaterThanOrEqual(0);
      expect(declPos).toBeGreaterThan(out.indexOf('x.ok; });'));
      expect(declPos).toBeLessThan(out.indexOf('return <li'));
    });

    it('ignores a capture declaration mentioned only in a comment', () => {
      const body = `() => {
    const msg = state.msg;
    return items.map((item) => {
        // note: const msg = state.msg above
        return <li ${attrText}>t</li>;
    });
}`;
      const out = rewriteNestedCallSitesInline(
        body,
        [hoistedAttrSite(body, 'q_m', '_hw3', 'msg')],
        0
      );
      const declPos = out.indexOf('const _hw3 = q_m.w([');
      expect(declPos).toBeGreaterThanOrEqual(0);
      // The real declaration is in the component scope, so the hoist goes there.
      expect(declPos).toBeLessThan(out.indexOf('return items.map'));
    });
  });
});
