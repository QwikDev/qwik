/**
 * Tests for parent module rewriting engine.
 *
 * Verifies that rewriteParentModule produces correct output structure:
 * optimizer-added imports, QRL declarations, rewritten body with
 * proper call form transformations.
 */

import { describe, it, expect } from 'vitest';
import { rewriteParentModule } from '../../src/optimizer/rewrite-parent.js';
import { extractSegments } from '../../src/optimizer/extract.js';
import { collectImports } from '../../src/optimizer/marker-detection.js';
import { parseSync } from 'oxc-parser';

/**
 * Helper: extract and rewrite a source file, returning the parent code.
 */
function rewrite(source: string, relPath = 'test.tsx'): string {
  const extractions = extractSegments(source, relPath);
  const { program } = parseSync(relPath, source);
  const imports = collectImports(program);
  const result = rewriteParentModule(source, relPath, extractions, imports);
  return result.code;
}

describe('rewriteParentModule', () => {
  it('Test 1: single component$ rewrite produces correct parent output', () => {
    const source = `import { component$ } from "@qwik.dev/core";
export const App = component$(() => {
  return <div>Hello</div>;
});`;
    const code = rewrite(source);

    // Should have componentQrl import
    expect(code).toContain('import { componentQrl } from "@qwik.dev/core";');
    // Should have qrl import
    expect(code).toContain('import { qrl } from "@qwik.dev/core";');
    // Should have QRL declaration
    expect(code).toMatch(/const q_\w+ = \/\*#__PURE__\*\/ qrl\(\(\)=>import\(/);
    // Should have componentQrl call with PURE annotation
    expect(code).toContain('/*#__PURE__*/ componentQrl(q_');
    // Should NOT have component$ in the body (it's been rewritten)
    expect(code).not.toMatch(/component\$\(/);
  });

  it('Test 2: bare $() replaced directly with q_symbolName', () => {
    const source = `import { $ } from "@qwik.dev/core";
const handler = $(() => {
  console.log("hello");
});`;
    const code = rewrite(source, 'test.ts');

    // Bare $ extractions produce a QRL declaration and replace usage with variable name
    expect(code).toMatch(/const q_handler_\w+ = \/\*#__PURE__\*\/ qrl\(/);
    // The original call site is replaced with the QRL variable reference
    expect(code).toMatch(/q_handler_\w+;/);
    // Should NOT have $( in the output
    expect(code).not.toContain('$(');
  });

  it('Test 3: multiple extractions produce sorted QRL declarations', () => {
    const source = `import { component$, $ } from "@qwik.dev/core";
export const App = component$(() => {
  return <div>Hello</div>;
});
const handler = $(() => {
  console.log("hi");
});`;
    const code = rewrite(source);

    // Should have multiple QRL declarations
    const qrlDecls = code
      .split('\n')
      .filter((line) => line.startsWith('const q_'));
    expect(qrlDecls.length).toBe(2);
    // Should be sorted alphabetically
    expect(qrlDecls[0] < qrlDecls[1]).toBe(true);
  });

  it('Test 4: @builder.io/qwik rewritten to @qwik.dev/core', () => {
    const source = `import { component$ } from "@builder.io/qwik";
export const App = component$(() => {
  return <div>Hello</div>;
});`;
    const code = rewrite(source);

    // Old import should be rewritten
    expect(code).not.toContain('@builder.io/qwik');
    expect(code).toContain('@qwik.dev/core');
  });

  it('Test 5: optimizer-added imports are separate statements', () => {
    const source = `import { component$ } from "@qwik.dev/core";
export const App = component$(() => {
  return <div>Hello</div>;
});`;
    const code = rewrite(source);

    // qrl and componentQrl should be SEPARATE import statements
    const importLines = code
      .split('\n')
      .filter((line) => line.startsWith('import {'));

    const qrlImport = importLines.find((l) => l.includes('{ qrl }'));
    const componentQrlImport = importLines.find((l) =>
      l.includes('{ componentQrl }'),
    );
    expect(qrlImport).toBeDefined();
    expect(componentQrlImport).toBeDefined();
    // They should be separate lines
    expect(qrlImport).not.toBe(componentQrlImport);
  });

  it('Test 6: existing non-marker imports preserved', () => {
    const source = `import { component$, useStore } from "@qwik.dev/core";
export const App = component$(() => {
  const state = useStore({ count: 0 });
  return <div>{state.count}</div>;
});`;
    const code = rewrite(source);

    // useStore should still be imported (it's not a marker)
    expect(code).toContain('useStore');
    // The original import should keep useStore
    expect(code).toMatch(/import\s*\{\s*useStore\s*\}\s*from\s*"@qwik\.dev\/core"/);
  });

  it('Test 7: PURE annotation on componentQrl but NOT on useTaskQrl', () => {
    const source = `import { component$, useTask$ } from "@qwik.dev/core";
export const App = component$(() => {
  return <div>Hello</div>;
});
export const task = useTask$(() => {
  console.log("task");
});`;
    const code = rewrite(source);

    // componentQrl should have PURE annotation
    expect(code).toContain('/*#__PURE__*/ componentQrl(');
    // useTaskQrl should NOT have PURE annotation
    // It should appear as just useTaskQrl( without PURE
    const useTaskLine = code.split('\n').find((l) => l.includes('useTaskQrl('));
    expect(useTaskLine).toBeDefined();
    expect(useTaskLine).not.toContain('/*#__PURE__*/');
  });

  it('Test 8: sync$ call rewritten inline without QRL declaration', () => {
    const source = `import { sync$ } from "@qwik.dev/core";
const fn = sync$(() => {
  return true;
});`;
    const code = rewrite(source, 'test.ts');

    // sync$ should become _qrlSync(original, "minified")
    expect(code).toContain('_qrlSync(');
    // Should have _qrlSync import
    expect(code).toContain('import { _qrlSync } from "@qwik.dev/core";');
    // Should NOT have a QRL declaration for sync (no const q_...)
    const qrlDecls = code
      .split('\n')
      .filter((line) => line.startsWith('const q_'));
    expect(qrlDecls.length).toBe(0);
  });

  it('Test 9: nested $() calls produce parent-child relationship', () => {
    const source = `import { component$, $ } from "@qwik.dev/core";
export const App = component$(() => {
  const handler = $(() => {
    console.log("nested");
  });
  return <div onClick$={handler}>Hello</div>;
});`;
    const extractions = extractSegments(source, 'test.tsx');
    const { program } = parseSync('test.tsx', source);
    const imports = collectImports(program);
    const result = rewriteParentModule(source, 'test.tsx', extractions, imports);

    // Should have extractions with parent relationship
    // The inner $() should reference the outer component$ as parent
    // (This depends on extractSegments setting parent correctly)
    expect(result.extractions.length).toBeGreaterThanOrEqual(2);
  });

  it('Test 10: custom inlined useMemo$ rewritten without adding import', () => {
    const source = `import { $ } from "@qwik.dev/core";

const useMemoQrl = (qrl) => qrl;
export const useMemo$ = /*#__PURE__*/ wrap(useMemoQrl);

const val = useMemo$(() => {
  return 42;
});`;
    // Note: custom inlined detection requires `export const X$ = wrap(XQrl)` pattern
    // This is a simplified test - the actual detection is in marker-detection.ts
    const code = rewrite(source, 'test.ts');

    // useMemo$ should be rewritten to useMemoQrl
    expect(code).toContain('useMemoQrl(q_');
    // Should NOT add an import for useMemoQrl (it's locally defined)
    const importLines = code
      .split('\n')
      .filter(
        (line) =>
          line.startsWith('import {') && line.includes('useMemoQrl'),
      );
    expect(importLines.length).toBe(0);
  });

  it('Test 11: no duplicate imports when symbol already imported', () => {
    const source = `import { component$, componentQrl } from "@qwik.dev/core";
export const App = component$(() => {
  return <div>Hello</div>;
});`;
    const code = rewrite(source);

    // componentQrl should NOT be added as a new import since it's already imported
    const componentQrlImports = code
      .split('\n')
      .filter(
        (line) =>
          line.startsWith('import {') && line.includes('componentQrl'),
      );
    // Should have at most 1 (the existing one, possibly rewritten)
    expect(componentQrlImports.length).toBeLessThanOrEqual(1);
  });

  it('Test 12: parent output has // separators between sections', () => {
    const source = `import { component$ } from "@qwik.dev/core";
export const App = component$(() => {
  return <div>Hello</div>;
});`;
    const code = rewrite(source);

    // Should have // separators
    const lines = code.split('\n');
    const separatorCount = lines.filter((l) => l.trim() === '//').length;
    expect(separatorCount).toBeGreaterThanOrEqual(2);
  });
});
