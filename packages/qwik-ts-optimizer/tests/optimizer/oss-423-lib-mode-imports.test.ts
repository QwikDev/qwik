/**
 * Regression tests for OSS-423 — lib-mode preserves original `$`-suffix
 * marker imports + `jsx as _jsx` runtime import (Sub-C of OSS-420 lib-mode
 * umbrella, the final slice that flipped `example_lib_mode`).
 *
 * Pre-OSS-423 (after OSS-421 Sub-A landed the emission shape): lib-mode
 * output dropped the user-facing `*$` markers (`component$`, `useStyle$`,
 * `useTask$`, `server$`, etc.) and the `jsx as _jsx` runtime import from
 * the parent module's import surface — they were considered "unused"
 * after being rewritten to their `*Qrl` forms and got stripped by both
 * `processImports` (rewrite phase), `filterUnusedImports` (post-rewrite),
 * `oxcTransformSync` (TS strip), and `removeUnusedImports` (module-cleanup).
 *
 * The OSS-423 fix preserves them at all four strip sites in lib mode:
 *
 * 1. `processImports` in `rewrite/index.ts`: skip the `toRemove.push(i)`
 *    when `isLibMode` AND the importedName is `*$`-suffix (length > 1).
 * 2. `filterUnusedImports` in `rewrite/output-assembly.ts`: include `*$`
 *    specifiers in `usedNamed` unconditionally when `isLibMode`, even
 *    when the local name isn't referenced in body text.
 * 3. Post-`oxcTransformSync` re-prepend in `rewrite/output-assembly.ts`:
 *    capture the lib-preserved imports BEFORE TS-strip and re-prepend
 *    them after — TS-strip aggressively eliminates unused value imports
 *    and the `onlyRemoveTypeImports` flag doesn't override that.
 * 4. `removeUnusedImports` in `transform/module-cleanup.ts`: skip strip
 *    for `*$`-suffix specifiers from `@qwik.dev/core` and `jsx` from
 *    `@qwik.dev/core/jsx-runtime` when `isLibMode`.
 *
 * Plus `collectNeededImports` in `output-assembly.ts` adds the
 * `jsx as _jsx` entry to `neededImports` under lib mode (it's not
 * referenced via the JSX walker but is part of SWC's lib emit surface).
 *
 * compareAst gained one normalizer change: `isIndependentTopLevel` now
 * also accepts `const NAME = <Literal>` VariableDeclarations, so SWC's
 * lib emit (declares the literal const BEFORE the export) and TS's
 * source-order emit (declares it AFTER) normalize to the same canonical
 * sort. Strictly gated to Literal initialisers — anything more complex
 * could have side effects whose order matters.
 *
 * Companion to convergence's `example_lib_mode` (the final F2 test from
 * the OSS-403 arc — closed via the OSS-420 umbrella). Sub-A (OSS-421)
 * shipped the emission shape; Sub-B (OSS-422) closed as no-op (existing
 * pipeline + simplifier already handled function-local const inlining);
 * Sub-C (this PR) preserves the import surface.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('OSS-423: lib-mode import preservation', () => {
  it('preserves `$`-suffix marker imports alongside their `*Qrl` rewrites', () => {
    const input = `
import { component$, useStyle$, useTask$ } from '@qwik.dev/core';
export const C = component$(() => {
  useStyle$(STYLES);
  useTask$(() => { console.log('task'); });
  return <div/>;
});
const STYLES = '.class {}';
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      mode: 'lib',
      transpileTs: true,
      transpileJsx: true,
    });
    const code = findParent(result).code;
    // All three `$`-suffix markers preserved on a single line.
    expect(code).toMatch(/import \{[^}]*\bcomponent\$[^}]*\} from ["']@qwik\.dev\/core["']/);
    expect(code).toMatch(/import \{[^}]*\buseStyle\$[^}]*\} from ["']@qwik\.dev\/core["']/);
    expect(code).toMatch(/import \{[^}]*\buseTask\$[^}]*\} from ["']@qwik\.dev\/core["']/);
    // Their `*Qrl` rewrites also appear (as separate imports).
    expect(code).toMatch(/import \{ componentQrl \} from ["']@qwik\.dev\/core["']/);
    expect(code).toMatch(/import \{ useStyleQrl \} from ["']@qwik\.dev\/core["']/);
    expect(code).toMatch(/import \{ useTaskQrl \} from ["']@qwik\.dev\/core["']/);
  });

  it('strips bare `$` (no marker-function semantics) under lib mode', () => {
    // The bare `$` marker is excluded from lib-mode preservation — it has
    // no marker-function semantics post-extraction and SWC's lib emit
    // also strips it from `example_lib_mode`'s expected output.
    const input = `
import { $, component$ } from '@qwik.dev/core';
export const C = component$(() => <div onClick={$(() => console.log('!'))}/>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      mode: 'lib',
      transpileTs: true,
      transpileJsx: true,
    });
    const code = findParent(result).code;
    expect(code).toMatch(/component\$/);  // `component$` preserved
    // Bare `$` is stripped — extract just the marker imports and confirm
    // no standalone `$` specifier slipped through.
    const importMatch = code.match(/import \{([^}]+)\} from ["']@qwik\.dev\/core["']/);
    expect(importMatch).not.toBeNull();
    const specs = importMatch![1].split(',').map((s) => s.trim());
    expect(specs).not.toContain('$');
  });

  it('adds `jsx as _jsx` import from `@qwik.dev/core/jsx-runtime` under lib mode', () => {
    // SWC's lib emit unconditionally includes this import alongside the
    // rewritten `_jsxSorted` form — JSX runtime export surface for
    // downstream library consumers. TS now matches.
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(() => <div/>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      mode: 'lib',
      transpileTs: true,
      transpileJsx: true,
    });
    const code = findParent(result).code;
    expect(code).toMatch(/import \{ jsx as _jsx \} from ["']@qwik\.dev\/core\/jsx-runtime["']/);
  });

  it('non-lib modes still strip `$`-suffix markers from imports (negative scope)', () => {
    // Default `mode: 'prod'` — historic behavior: `$`-suffix markers
    // stripped from imports once rewritten to `*Qrl` forms. The new
    // lib-mode preservation code path doesn't leak into other modes.
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(() => <div/>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      mode: 'prod',
      transpileTs: true,
      transpileJsx: true,
    });
    const code = findParent(result).code;
    expect(code).not.toMatch(/\bcomponent\$/);
    expect(code).not.toMatch(/import \{ jsx as _jsx \}/);
  });

  it('non-lib modes still strip `jsx as _jsx` (negative scope)', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(() => <div/>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      mode: 'dev',
      transpileTs: true,
      transpileJsx: true,
    });
    const code = findParent(result).code;
    expect(code).not.toMatch(/jsx as _jsx/);
  });

  it('end-to-end: example_lib_mode flips with Sub-A + Sub-C', () => {
    // The full example_lib_mode input — combines emission shape (Sub-A),
    // const-text inlining (Sub-B no-op via existing pipeline), and
    // import preservation (Sub-C). All three together produce the SWC-
    // matching output.
    const input = `
import { $, component$, server$, useStyle$, useTask$, useSignal } from '@qwik.dev/core';

export const Works = component$((props) => {
\tuseStyle$(STYLES);
\tconst text = 'hola';
\tconst sig = useSignal('hola');
\tuseTask$(() => {
\t\tconsole.log(sig.value, text);
\t});
\treturn (
\t\t<div onClick$={server$(() => console.log('in server', sig.value, text))}></div>
\t);
});

const STYLES = '.class {}';
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      mode: 'lib',
      transpileTs: true,
      transpileJsx: true,
    });
    const code = findParent(result).code;

    // Sub-A: emission shape (markerQrl(inlinedQrl(...)))
    expect(code).toMatch(/componentQrl\(\/\*[^*]*\*\/ inlinedQrl/);
    expect(code).toMatch(/useStyleQrl\(\/\*[^*]*\*\/ inlinedQrl/);
    expect(code).toMatch(/useTaskQrl\(\/\*[^*]*\*\/ inlinedQrl/);
    expect(code).toMatch(/serverQrl\(\/\*[^*]*\*\/ inlinedQrl/);

    // Sub-B effect: `text = 'hola'` const folded at use sites.
    expect(code).toMatch(/console\.log\(sig\.value, ["']hola["']\)/);

    // Sub-C: original `*$` markers preserved.
    expect(code).toMatch(/\bcomponent\$/);
    expect(code).toMatch(/\bserver\$/);
    expect(code).toMatch(/\buseStyle\$/);
    expect(code).toMatch(/\buseTask\$/);
    expect(code).toMatch(/\buseSignal\b/);

    // Sub-C: jsx as _jsx runtime import.
    expect(code).toMatch(/import \{ jsx as _jsx \} from ["']@qwik\.dev\/core\/jsx-runtime["']/);

    // No segment-file modules (Sub-A's suppression).
    const segments = result.modules.filter((m) => m.kind === 'segment');
    expect(segments.length).toBe(0);
  });
});
