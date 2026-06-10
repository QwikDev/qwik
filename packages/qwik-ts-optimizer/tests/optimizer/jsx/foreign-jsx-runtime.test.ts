/**
 * Regression tests for foreign `@jsxImportSource` pragma support
 * (part of the F6 foreign-JSX work).
 *
 * Pre-fix: when source carried `/* @jsxImportSource react *‌/`, the
 * optimizer rewrote the file's JSX to Qwik's `_jsxSorted` form and event-
 * extracted `onClick$` to `q-e:click`. That's wrong: the pragma says the
 * file's JSX belongs to React's runtime, not Qwik's. SWC's reference
 * leaves JSX intact so the React JSX transform handles it later, emitting
 * `import { jsx as _jsx } from "react/jsx-runtime"` + `_jsx("div", { onClick$ })`.
 *
 * The partial pre-existing fix at `extract.ts:432` (regex on source) gated
 * JSX `$`-suffix attribute extraction — `<div onClick$>` no longer became
 * its own QRL segment — but missed three coupled paths:
 *   1. `runJsxTransform` (parent path) still rewrote JSX → `_jsxSorted`.
 *   2. `transformAllJsx` (segment path) did the same inside segments.
 *   3. Segment files (brand-new generated modules) wouldn't inherit the
 *      pragma, so oxc-transform's TS-strip pass wouldn't pick the right
 *      runtime for whatever JSX survived into them.
 *
 * Fix:
 *   - New `detectForeignJsxRuntime(source)` helper in `utils/jsx-import-source.ts`
 *     returns both the boolean flag and the matched pragma text.
 *   - Flag threaded into `RewriteContext.hasForeignJsxRuntime` +
 *     `SegmentGenerationContext.{hasForeignJsxRuntime, foreignJsxPragmaText}`.
 *   - `runJsxTransform` early-returns when the flag is set.
 *   - `generateSegmentCode` is passed `enableJsx: false` when the flag is set.
 *   - Segment code is prefixed with the pragma text before `postProcessSegmentCode`
 *     so oxc-transform sees + honors it.
 *   - `postProcessSegmentCode` extends its oxc-transform gate to fire when
 *     the body contains raw JSX (since pragma-skip means JSX survives).
 *
 * Companion to convergence's `example_jsx_import_source` (target — flips
 * with this fix).
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';
import { detectForeignJsxRuntime } from '../../../src/optimizer/jsx/jsx-import-source.js';

function findSegmentByCtx(
  result: { modules: readonly TransformModule[] },
  ctxName: string,
): TransformModule {
  const m = result.modules.find(
    (mod) => mod.kind === 'segment' && mod.segment.ctxName === ctxName,
  );
  if (!m) throw new Error(`segment with ctxName=${ctxName} not found`);
  return m;
}

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const m = result.modules.find((mod) => mod.kind === 'parent');
  if (!m) throw new Error('parent module not found');
  return m;
}

describe('foreign @jsxImportSource pragma support', () => {
  describe('detectForeignJsxRuntime helper', () => {
    it('detects a react pragma and returns the matched text', () => {
      const src = `/* @jsxImportSource react */\nconst x = 1;`;
      const r = detectForeignJsxRuntime(src);
      expect(r.hasForeignJsxRuntime).toBe(true);
      expect(r.pragmaText).toBe('/* @jsxImportSource react */');
    });

    it('does NOT flag Qwik-named import sources (those stay under Qwik optimization)', () => {
      const r1 = detectForeignJsxRuntime(`/* @jsxImportSource @qwik.dev/core */\n`);
      const r2 = detectForeignJsxRuntime(`/* @jsxImportSource @builder.io/qwik */\n`);
      expect(r1.hasForeignJsxRuntime).toBe(false);
      expect(r1.pragmaText).toBeNull();
      expect(r2.hasForeignJsxRuntime).toBe(false);
      expect(r2.pragmaText).toBeNull();
    });

    it('returns hasForeignJsxRuntime=false when no pragma is present', () => {
      const r = detectForeignJsxRuntime(`const x = 1;\nconst y = <div/>;`);
      expect(r.hasForeignJsxRuntime).toBe(false);
      expect(r.pragmaText).toBeNull();
    });
  });

  describe('parent module', () => {
    it('skips Qwik JSX-syntax rewrite under foreign pragma (no _jsxSorted)', () => {
      const input = `/* @jsxImportSource react */
import { qwikify$ } from './qwikfy';
export const App = () => (
  <div onClick$={() => console.log('App')}></div>
);
`;
      const result = transformModule({
        input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
        srcDir: mkFilePath('.'),
        transpileTs: true, transpileJsx: true,
      });

      const parent = findParent(result);
      // No Qwik JSX rewrite: no _jsxSorted, no event extraction to q-e:click.
      expect(parent.code).not.toMatch(/_jsxSorted/);
      expect(parent.code).not.toMatch(/"q-e:click"/);
      // oxc-transform's default JSX transform took over: React jsx-runtime
      // import is present and `onClick$` survives as a literal prop.
      expect(parent.code).toMatch(/import \{ jsx as _jsx \} from ["']react\/jsx-runtime["']/);
      expect(parent.code).toMatch(/_jsx\("div", \{\s*onClick\$:/);
    });

    it('marker calls (qwikify$) still extract under foreign pragma', () => {
      // The Qwik↔foreign-runtime bridge — qwikify$ must still produce a
      // segment + componentQrl rewrite even though JSX-syntax rewrite is
      // skipped.
      const input = `/* @jsxImportSource react */
import { qwikify$ } from './qwikfy';
export const App2 = qwikify$(() => (
  <div onClick$={() => console.log('App2')}></div>
));
`;
      const result = transformModule({
        input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
        srcDir: mkFilePath('.'),
        transpileTs: true, transpileJsx: true,
      });

      const parent = findParent(result);
      // qwikify$ → qwikifyQrl(<some q_*>) at the call site, plus a qrl decl
      // pointing at the App2_qwikify segment file (canonicalFilename
      // preserved in the import path even when prod rename shortens the
      // symbol name itself).
      expect(parent.code).toMatch(/qwikifyQrl\(q_/);
      expect(parent.code).toMatch(/qrl\(\(\) => import\("\.\/test\.tsx_App2_qwikify_/);
    });
  });

  describe('segment module', () => {
    it('segment file gets the pragma injected and emits React _jsx', () => {
      // Brand-new generated module — won't inherit pragma from user source
      // unless we explicitly inject it before oxc-transform runs.
      const input = `/* @jsxImportSource react */
import { qwikify$ } from './qwikfy';
export const App2 = qwikify$(() => (
  <div onClick$={() => console.log('App2')}></div>
));
`;
      const result = transformModule({
        input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
        srcDir: mkFilePath('.'),
        transpileTs: true, transpileJsx: true,
      });

      const seg = findSegmentByCtx(result, 'qwikify$');
      // Segment received the pragma + the React runtime import.
      expect(seg.code).toMatch(/import \{ jsx as _jsx \} from ["']react\/jsx-runtime["']/);
      expect(seg.code).toMatch(/_jsx\("div", \{\s*onClick\$:/);
      // No Qwik rewrite leaked into the segment.
      expect(seg.code).not.toMatch(/_jsxSorted/);
      expect(seg.code).not.toMatch(/"q-e:click"/);
    });
  });

  describe('negative-scope: no pragma → unchanged Qwik behavior', () => {
    it('without pragma, JSX is rewritten to Qwik _jsxSorted as usual', () => {
      const input = `
import { component$ } from '@qwik.dev/core';
export default component$(() => (
  <div onClick$={() => console.log('App')}></div>
));
`;
      const result = transformModule({
        input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
        srcDir: mkFilePath('.'),
        transpileTs: true, transpileJsx: true,
      });

      const seg = findSegmentByCtx(result, 'component$');
      // Standard Qwik rewrite path: _jsxSorted + q-e:click + own QRL segment
      // for the onClick$ handler. No React jsx-runtime import.
      expect(seg.code).toMatch(/_jsxSorted\("div"/);
      expect(seg.code).not.toMatch(/from ["']react\/jsx-runtime["']/);
    });

    it('Qwik-named pragma does NOT trigger foreign-runtime gate', () => {
      // Same shape as the React fixture but pragma names Qwik — the
      // detection helper must allow normal Qwik optimization to proceed.
      const input = `/* @jsxImportSource @qwik.dev/core */
import { component$ } from '@qwik.dev/core';
export default component$(() => (
  <div onClick$={() => 1}></div>
));
`;
      const result = transformModule({
        input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
        srcDir: mkFilePath('.'),
        transpileTs: true, transpileJsx: true,
      });

      const seg = findSegmentByCtx(result, 'component$');
      expect(seg.code).toMatch(/_jsxSorted\("div"/);
      expect(seg.code).not.toMatch(/from ["']react\/jsx-runtime["']/);
    });
  });
});
