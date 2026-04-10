import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import {
  collectImports,
  collectCustomInlined,
  getCalleeName,
  isMarkerCall,
  isBare$,
  isSyncMarker,
  getCtxKind,
  getCtxName,
  type ImportInfo,
  type CustomInlinedInfo,
} from '../../src/optimizer/marker-detection.js';

/** Helper: parse code and return the AST program node */
function parse(code: string) {
  const result = parseSync('test.tsx', code);
  return result.program;
}

/** Helper: find first CallExpression in a program */
function findFirstCall(program: any): any {
  for (const node of program.body) {
    if (node.type === 'ExpressionStatement' && node.expression.type === 'CallExpression') {
      return node.expression;
    }
    // Handle export const X = component$(() => ...)
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        if (decl.init?.type === 'CallExpression') {
          return decl.init;
        }
      }
    }
    if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration') {
      for (const decl of node.declaration.declarations) {
        if (decl.init?.type === 'CallExpression') {
          return decl.init;
        }
      }
    }
  }
  return null;
}

describe('marker-detection', () => {
  describe('collectImports', () => {
    it('extracts qwik core imports with isQwikCore=true', () => {
      const program = parse(`
        import { component$, useTask$ } from '@qwik.dev/core';
      `);
      const imports = collectImports(program);
      expect(imports.size).toBe(2);

      const comp = imports.get('component$');
      expect(comp).toBeDefined();
      expect(comp!.localName).toBe('component$');
      expect(comp!.importedName).toBe('component$');
      expect(comp!.source).toBe('@qwik.dev/core');
      expect(comp!.isQwikCore).toBe(true);

      const task = imports.get('useTask$');
      expect(task).toBeDefined();
      expect(task!.isQwikCore).toBe(true);
    });

    it('marks non-qwik imports as isQwikCore=false', () => {
      const program = parse(`
        import { something$ } from 'some-other-lib';
      `);
      const imports = collectImports(program);
      expect(imports.size).toBe(1);

      const imp = imports.get('something$');
      expect(imp).toBeDefined();
      expect(imp!.isQwikCore).toBe(false);
    });
  });

  describe('isMarkerCall', () => {
    it('returns true for component$() when imported from @qwik.dev/core', () => {
      const program = parse(`
        import { component$ } from '@qwik.dev/core';
        component$(() => {});
      `);
      const imports = collectImports(program);
      const call = findFirstCall(program);
      expect(call).not.toBeNull();
      expect(isMarkerCall(call, imports, new Map())).toBe(true);
    });

    it('returns true for bare $() when imported from @qwik.dev/core', () => {
      const program = parse(`
        import { $ } from '@qwik.dev/core';
        $(() => {});
      `);
      const imports = collectImports(program);
      const call = findFirstCall(program);
      expect(call).not.toBeNull();
      expect(isMarkerCall(call, imports, new Map())).toBe(true);
    });

    it('returns false for randomFunc$() not imported from qwik', () => {
      const program = parse(`
        import { randomFunc$ } from 'some-lib';
        randomFunc$(() => {});
      `);
      const imports = collectImports(program);
      const call = findFirstCall(program);
      expect(call).not.toBeNull();
      expect(isMarkerCall(call, imports, new Map())).toBe(false);
    });

    it('returns true for useMemo$() when found in customInlined map', () => {
      const program = parse(`
        useMemo$(() => {});
      `);
      // Simulate: useMemo$ is a custom inlined function
      const imports = new Map<string, ImportInfo>();
      const customInlined = new Map<string, CustomInlinedInfo>();
      customInlined.set('useMemo$', {
        dollarName: 'useMemo$',
        qrlName: 'useMemoQrl',
      });
      const call = findFirstCall(program);
      expect(call).not.toBeNull();
      expect(isMarkerCall(call, imports, customInlined)).toBe(true);
    });
  });

  describe('isBare$', () => {
    it('returns true for callee name "$", false for "component$"', () => {
      const program1 = parse(`$(() => {});`);
      const call1 = findFirstCall(program1);
      expect(isBare$(call1)).toBe(true);

      const program2 = parse(`component$(() => {});`);
      const call2 = findFirstCall(program2);
      expect(isBare$(call2)).toBe(false);
    });
  });

  describe('collectCustomInlined', () => {
    it('detects export const useMemo$ = wrap(useMemoQrl) pattern', () => {
      const program = parse(`
        export const useMemoQrl = (qrt) => { useEffect(qrt); };
        export const useMemo$ = wrap(useMemoQrl);
      `);
      const custom = collectCustomInlined(program);
      expect(custom.size).toBe(1);

      const entry = custom.get('useMemo$');
      expect(entry).toBeDefined();
      expect(entry!.dollarName).toBe('useMemo$');
      expect(entry!.qrlName).toBe('useMemoQrl');
    });
  });

  describe('isSyncMarker', () => {
    it('returns true for "sync$", false for "component$"', () => {
      expect(isSyncMarker('sync$')).toBe(true);
      expect(isSyncMarker('component$')).toBe(false);
    });
  });

  describe('getCtxKind', () => {
    it('returns "eventHandler" when isJsxEventAttr=true, "function" otherwise', () => {
      expect(getCtxKind('component$', false)).toBe('function');
      expect(getCtxKind('$', false)).toBe('function');
      expect(getCtxKind('onClick$', true)).toBe('eventHandler');
      expect(getCtxKind('onChange$', true)).toBe('eventHandler');
    });
  });

  describe('getCtxName', () => {
    it('returns the marker name', () => {
      expect(getCtxName('$', false)).toBe('$');
      expect(getCtxName('component$', false)).toBe('component$');
      expect(getCtxName('useTask$', false)).toBe('useTask$');
      // For JSX event attrs, the ctxName comes from the attribute name
      expect(getCtxName('$', true, 'onClick$')).toBe('onClick$');
    });
  });
});
