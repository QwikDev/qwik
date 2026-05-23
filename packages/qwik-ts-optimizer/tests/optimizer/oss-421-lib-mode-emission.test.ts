/**
 * Regression tests for OSS-421 — lib-mode emission shape (Sub-A of the
 * OSS-420 refactor umbrella, the `example_lib_mode` parity fix).
 *
 * Pre-fix bug: `mode: 'lib'` (an `EmitMode` enum value defined in
 * `src/optimizer/types.ts:479`) was *defined* but never *consumed*. TS
 * treated it as default smart strategy and emitted 4 separate segment
 * files plus a parent module with `qrl(()=>import(...))` references —
 * fundamentally diverging from SWC's library-mode emit (single-module
 * output with all bodies inlined as `inlinedQrl(body, name, [captures])`).
 *
 * Fix: when `options.mode === 'lib'`, override `entryStrategy` to
 * `{ type: 'inline' }`, set `isLibMode` on `InlineStrategyOptions` →
 * `RewriteContext`, run the inline pipeline normally, then post-process
 * the assembled output via `collapseToLibInlinedQrl` to transform the
 * `const q_X = _noopQrl(name); q_X.s(body)` triple into a single
 * `inlinedQrl(body, name, [captures])` literal at every `q_X` reference.
 * Bodies are substituted bottom-up so nested references resolve in
 * source order. Segment-file modules are suppressed in the result.
 * `_auto_X` re-exports are also suppressed (no segment files need them).
 *
 * What this PR (Sub-A) does NOT do: preserve original `$`-suffix imports
 * (Sub-C / OSS-423) or do aggressive const-text inlining (Sub-B /
 * OSS-422). The target convergence test `example_lib_mode` will flip
 * only when Sub-C lands too; Sub-B may turn out to be a no-op since the
 * existing inline pipeline + simplifier already handle function-local
 * const-text bindings.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../src/optimizer/types.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('OSS-421: lib-mode emission shape', () => {
  it('emits markerQrl(inlinedQrl(body, name)) for top-level component$ under mode=lib', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const Greet = component$((props) => <div>{props.name}</div>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      mode: 'lib',
      transpileTs: true,
      transpileJsx: true,
    });

    const code = findParent(result).code;
    // The componentQrl wrap directly nests inlinedQrl(body, "name") — no
    // `_noopQrl(...)` const decl, no separate `q_X.s(body)` statement.
    expect(code).toMatch(
      /export const Greet = \/\*\s*[#@]__PURE__\s*\*\/ componentQrl\(\/\*\s*[#@]__PURE__\s*\*\/ inlinedQrl\(/,
    );
    expect(code).toMatch(/, "Greet_component_[A-Za-z0-9_]+"\)\)/);
    // No leftover `_noopQrl` reference.
    expect(code).not.toMatch(/_noopQrl/);
    // No leftover `q_X.s(...)` statement.
    expect(code).not.toMatch(/q_[A-Za-z0-9_]+\.s\(/);
  });

  it('threads captures via inlinedQrl 3rd argument under mode=lib', () => {
    // useTask$ closure captures a useSignal binding. The collapsed form
    // emits `useTaskQrl(inlinedQrl(body, "name", [sig]))` — captures
    // array as 3rd positional arg, not via `.w([...])`.
    const input = `
import { component$, useTask$, useSignal } from '@qwik.dev/core';
export const C = component$(() => {
  const sig = useSignal(0);
  useTask$(() => { console.log(sig.value); });
  return <div/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      mode: 'lib',
      transpileTs: true,
      transpileJsx: true,
    });

    const code = findParent(result).code;
    // Captures as the 3rd argument: [sig].
    expect(code).toMatch(/inlinedQrl\(\(\)\s*=>\s*\{[\s\S]*?\}, "C_component_useTask_[A-Za-z0-9_]+", \[sig\]\)/);
    // The captures array is the 3rd `inlinedQrl(...)` positional arg
    // (NOT wired via `.w([...])` like the inline-strategy default path).
    expect(code).not.toMatch(/\.w\(\[/);
  });

  it('preserves user-level module const decls as identifier refs (not value-inlined)', () => {
    // A module-level `const STYLES = '.class {}'` referenced via
    // `useStyle$(STYLES)` should land as `useStyleQrl(inlinedQrl(STYLES, "..."))`
    // — keeping STYLES as an identifier, not folding its value. The
    // const decl stays at module level.
    const input = `
import { component$, useStyle$ } from '@qwik.dev/core';
export const Works = component$(() => {
  useStyle$(STYLES);
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
    // inlinedQrl wraps the identifier STYLES (not its value '.class {}').
    expect(code).toMatch(/useStyleQrl\(\/\*[^*]*\*\/ inlinedQrl\(STYLES, "Works_component_useStyle_[A-Za-z0-9_]+"\)\)/);
    // The const decl remains.
    expect(code).toMatch(/const STYLES = ['"]\.class \{\}['"]/);
  });

  it('suppresses segment-file modules under mode=lib', () => {
    // Lib mode is single-module by design. Segment files are NOT
    // emitted even though the extraction phase still runs.
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

    // Only the parent module appears in the result.
    const segments = result.modules.filter((m) => m.kind === 'segment');
    expect(segments.length).toBe(0);
  });

  it('suppresses _auto_X re-exports under mode=lib', () => {
    // `_auto_X` re-exports exist for cross-module access in segment-file
    // mode. Lib mode has no segment files — the re-exports are stripped.
    const input = `
import { component$, useStyle$ } from '@qwik.dev/core';
export const C = component$(() => {
  useStyle$(STYLES);
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
    expect(code).not.toMatch(/_auto_/);
  });

  it('imports `inlinedQrl` (and not `_noopQrl`) under mode=lib', () => {
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
    expect(code).toMatch(/import \{ inlinedQrl \} from ["']@qwik\.dev\/core["']/);
    expect(code).not.toMatch(/import \{ _noopQrl \}/);
  });

  it('non-lib modes still use the segment-file emission shape (negative scope)', () => {
    // Same input, mode='prod' (default smart strategy) — produces the
    // historic shape with `qrl(()=>import(...))` references and segment
    // modules in the result. Confirms the new lib-mode code path
    // doesn't leak into other modes.
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
    // Default emission: qrl()=>import('./...') reference, NOT inlinedQrl literal.
    expect(code).toMatch(/qrl\(\(\)\s*=>\s*import\(/);
    expect(code).not.toMatch(/inlinedQrl\(/);
    // Segment modules ARE emitted.
    const segments = result.modules.filter((m) => m.kind === 'segment');
    expect(segments.length).toBeGreaterThan(0);
  });
});
