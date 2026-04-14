import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import {
  collectExportNames,
  collectImports,
  collectCustomInlined,
  isMarkerCall,
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

    it('can read imports from parser module metadata', () => {
      const result = parseSync('test.tsx', `
        import foo, { component$ as Component } from '@qwik.dev/core';
        import * as ns from './local';
      `);
      const imports = collectImports(result.program, result.module);

      expect(imports.get('foo')?.importedName).toBe('default');
      expect(imports.get('Component')?.importedName).toBe('component$');
      expect(imports.get('ns')?.importedName).toBe('*');
      expect(imports.get('Component')?.isQwikCore).toBe(true);
      expect(imports.get('ns')?.isQwikCore).toBe(false);
    });
  });

  describe('collectExportNames', () => {
    it('can read export names from parser module metadata', () => {
      const result = parseSync('test.tsx', `
        export const useMemo$ = wrap(useMemoQrl);
        export { localThing as localThing$ };
      `);
      const names = collectExportNames(result.program, result.module);

      expect(names.has('useMemo$')).toBe(true);
      expect(names.has('localThing$')).toBe(true);
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

    it('returns true for formAction$() imported from non-Qwik package "forms"', () => {
      const program = parse(`
        import { formAction$ } from 'forms';
        formAction$(() => {});
      `);
      const imports = collectImports(program);
      const call = findFirstCall(program);
      expect(call).not.toBeNull();
      expect(isMarkerCall(call, imports, new Map())).toBe(true);
    });

    it('returns true for serverAuth$() imported from "@auth/qwik"', () => {
      const program = parse(`
        import { serverAuth$ } from '@auth/qwik';
        serverAuth$(() => {});
      `);
      const imports = collectImports(program);
      const call = findFirstCall(program);
      expect(call).not.toBeNull();
      expect(isMarkerCall(call, imports, new Map())).toBe(true);
    });

    it('returns true for Component when imported as { component$ as Component }', () => {
      const program = parse(`
        import { component$ as Component } from '@qwik.dev/core';
        Component(() => {});
      `);
      const imports = collectImports(program);
      const call = findFirstCall(program);
      expect(call).not.toBeNull();
      expect(isMarkerCall(call, imports, new Map())).toBe(true);
    });

    it('returns true for onRender when imported as { $ as onRender }', () => {
      const program = parse(`
        import { $ as onRender } from '@qwik.dev/core';
        onRender(() => {});
      `);
      const imports = collectImports(program);
      const call = findFirstCall(program);
      expect(call).not.toBeNull();
      expect(isMarkerCall(call, imports, new Map())).toBe(true);
    });

    it('returns false for local functions ending with $ that are NOT imported', () => {
      const program = parse(`
        function myFunc$() {}
        myFunc$();
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
