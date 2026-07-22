import { describe, it, expect } from 'vitest';
import { rewriteParentModule } from '../../../src/optimizer/rewrite/index.js';
import { extractSegments, type ExtractionResult } from '../../../src/optimizer/extraction/extract.js';
import { collectImports } from '../../../src/optimizer/extraction/marker-detection.js';
import { parseSync } from 'oxc-parser';
import { mkRelativePath } from '../../../src/optimizer/types/brands.js';

function rewrite(source: string, relPath = 'test.tsx'): string {
  const extractions = extractSegments(source, relPath);
  const { program } = parseSync(relPath, source);
  const imports = collectImports(program);
  const result = rewriteParentModule(source, mkRelativePath(relPath), extractions as ExtractionResult[], imports);
  return result.code;
}

describe('rewriteParentModule', () => {
  it('Test 1: single component$ rewrite produces correct parent output', () => {
    const source = `import { component$ } from "@qwik.dev/core";
export const App = component$(() => {
  return <div>Hello</div>;
});`;
    const code = rewrite(source);

    expect(code).toContain('import { componentQrl } from "@qwik.dev/core";');
    expect(code).toContain('import { qrl } from "@qwik.dev/core";');
    expect(code).toMatch(/const q_\w+ = \/\*#__PURE__\*\/ qrl\(\(\)=>import\(/);
    expect(code).toContain('/*#__PURE__*/ componentQrl(q_');
    expect(code).not.toMatch(/component\$\(/);
  });

  it('Test 2: bare $() replaced directly with q_symbolName', () => {
    const source = `import { $ } from "@qwik.dev/core";
const handler = $(() => {
  console.log("hello");
});`;
    const code = rewrite(source, 'test.ts');

    expect(code).toMatch(/\/\*#__PURE__\*\/ qrl\(\(\)=>import\(/);
    expect(code).not.toMatch(/const q_handler/);
    expect(code).not.toContain('$(');
  });

  it('Test 2b: bare $() with a leading PURE annotation does not strand it before the q_ reference', () => {
    const source = `import { $ } from "@qwik.dev/core";
export const handler = /*#__PURE__*/ $(() => console.log("hi"));`;
    const code = rewrite(source, 'test.ts');

    expect(
      /\/\*\s*#?@?__PURE__\s*\*\/\s*q_/.test(code),
      `Stranded PURE annotation before a q_ reference:\n${code}`,
    ).toBe(false);
    expect(code).toContain('export const handler = q_');
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

    const qrlDecls = code
      .split('\n')
      .filter((line) => line.startsWith('const q_'));
    expect(qrlDecls.length).toBe(1);
    expect(code).not.toMatch(/const q_handler/);
    expect(code).toMatch(/\/\*#__PURE__\*\/ qrl\(\(\)=>import\(.*handler/);
    expect(code).toMatch(/const q_.*component/);
  });

  it('Test 4: @builder.io/qwik rewritten to @qwik.dev/core', () => {
    const source = `import { component$ } from "@builder.io/qwik";
export const App = component$(() => {
  return <div>Hello</div>;
});`;
    const code = rewrite(source);

    expect(code).not.toContain('@builder.io/qwik');
    expect(code).toContain('@qwik.dev/core');
  });

  it('Test 5: optimizer-added imports are separate statements', () => {
    const source = `import { component$ } from "@qwik.dev/core";
export const App = component$(() => {
  return <div>Hello</div>;
});`;
    const code = rewrite(source);

    const importLines = code
      .split('\n')
      .filter((line) => line.startsWith('import {'));

    const qrlImport = importLines.find((l) => l.includes('{ qrl }'));
    const componentQrlImport = importLines.find((l) =>
      l.includes('{ componentQrl }'),
    );
    expect(qrlImport).toBeDefined();
    expect(componentQrlImport).toBeDefined();
    expect(qrlImport).not.toBe(componentQrlImport);
  });

  it('Test 6: existing non-marker imports preserved', () => {
    const source = `import { component$, useStore } from "@qwik.dev/core";
export const App = component$(() => {
  const state = useStore({ count: 0 });
  return <div>{state.count}</div>;
});`;
    const code = rewrite(source);

    expect(code).toContain('useStore');
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

    expect(code).toContain('/*#__PURE__*/ componentQrl(');
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

    expect(code).toContain('_qrlSync(');
    expect(code).toContain('import { _qrlSync } from "@qwik.dev/core";');
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
    const result = rewriteParentModule(source, mkRelativePath('test.tsx'), extractions as ExtractionResult[], imports);

    expect(result.extractions.length).toBeGreaterThanOrEqual(2);
    const nested = result.extractions.find((e) => e.parent != null);
    expect(nested).toBeDefined();
    expect(result.extractions.some((e) => e.symbolName === nested!.parent)).toBe(true);
  });

  it('Test 10: custom inlined useMemo$ rewritten without adding import', () => {
    const source = `import { $ } from "@qwik.dev/core";

const useMemoQrl = (qrl) => qrl;
export const useMemo$ = /*#__PURE__*/ wrap(useMemoQrl);

const val = useMemo$(() => {
  return 42;
});`;
    const code = rewrite(source, 'test.ts');

    expect(code).toContain('useMemoQrl(q_');
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

    const componentQrlImports = code
      .split('\n')
      .filter(
        (line) =>
          line.startsWith('import {') && line.includes('componentQrl'),
      );
    expect(componentQrlImports.length).toBeLessThanOrEqual(1);
  });

  it('Test 12: parent output has // separators between sections', () => {
    const source = `import { component$ } from "@qwik.dev/core";
export const App = component$(() => {
  return <div>Hello</div>;
});`;
    const code = rewrite(source);

    const lines = code.split('\n');
    const separatorCount = lines.filter((l) => l.trim() === '//').length;
    expect(separatorCount).toBeGreaterThanOrEqual(2);
  });
});
