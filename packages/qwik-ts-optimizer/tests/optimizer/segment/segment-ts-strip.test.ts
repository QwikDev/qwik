/**
 * Regression tests for TS-annotation stripping in segment bodies
 * (`example_immutable_analysis` parity).
 *
 * `postProcessSegmentCode`'s oxc-transform TS-strip pass needs a
 * parser-input filename with the correct dialect extension (.tsx / .ts
 * / .jsx / .js). Pre-fix, it was reading the *segment's* extension
 * (often downgraded to `.js` by `transform/index.ts:533-547` even when
 * the parent source contains TS) or, when the source-extensions map
 * missed the symbol, falling back to the same downgraded value.
 *
 * Result: a segment with body `(id: number) => …` extracted from a
 * `.tsx` source was handed to oxc-transform with filename
 * `..._remove.js`. oxc-transform refused TS syntax under a `.js`
 * filename and returned `code: ""` with an `Expected ',' or ')' but
 * found ':'` error. The if-branch's `if (tsStripped.code) result = …;`
 * silently kept the original code (with the unstripped annotation),
 * producing `(id: number) =>` in the emitted segment instead of SWC's
 * stripped `(id) =>`.
 *
 * Fix: thread the *parent input file's* extension through
 * `SegmentGenerationContext` as `parentSourceExt`. All segment bodies
 * come from extracted ranges of the parent file, so the parent
 * extension is the authoritative source dialect. Used for the
 * oxc-transform parser-input filename in `postProcessSegmentCode`.
 *
 * Doesn't flip `example_immutable_analysis` on its own — the
 * `.w([captures])` wrap on Component-prop QRLs is a separate fix.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function transformDefault(source: string, extra: Record<string, unknown> = {}) {
  return transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    mode: 'test',
    transpileTs: true,
    transpileJsx: true,
    ...extra,
  } as Parameters<typeof transformModule>[0]);
}

describe('TS type annotations stripped from non-JSX segment bodies', () => {
  describe('Positive: TS annotations on extracted closures are stripped', () => {
    it('arrow with single TS-annotated param → annotation stripped', () => {
      const result = transformDefault(`
import { component$, $ } from '@qwik.dev/core';
export const App = component$(() => {
  const handler = $((id: number) => {
    console.log(id);
  });
  return <div onClick$={handler}>x</div>;
});
`);
      const handler = result.modules.find(
        (m) => m.kind === 'segment' && m.segment.ctxName === '$',
      );
      if (handler?.kind !== 'segment') throw new Error('$ handler segment missing');
      // Annotation `: number` must be gone post-strip.
      expect(handler.code).not.toMatch(/\(id:\s*number\s*\)/);
      expect(handler.code).toMatch(/=\s*\(\s*id\s*\)\s*=>/);
    });

    it('arrow with multiple TS-annotated params → all stripped', () => {
      const result = transformDefault(`
import { component$, $ } from '@qwik.dev/core';
export const App = component$(() => {
  const handler = $((a: number, b: string, c: boolean) => a + b.length + (c ? 1 : 0));
  return <div onClick$={handler}>x</div>;
});
`);
      const handler = result.modules.find(
        (m) => m.kind === 'segment' && m.segment.ctxName === '$',
      );
      if (handler?.kind !== 'segment') throw new Error('$ handler segment missing');
      expect(handler.code).not.toMatch(/:\s*number/);
      expect(handler.code).not.toMatch(/:\s*string/);
      expect(handler.code).not.toMatch(/:\s*boolean/);
      // All three params stripped to bare names, comma-separated.
      expect(handler.code).toMatch(/=\s*\(\s*a\s*,\s*b\s*,\s*c\s*\)\s*=>/);
    });

    it('nested arrow inside segment body — both stripped', () => {
      const result = transformDefault(`
import { component$, $ } from '@qwik.dev/core';
export const App = component$(() => {
  const handler = $((items: number[]) => {
    return items.filter((x: number) => x > 0);
  });
  return <div onClick$={handler}>x</div>;
});
`);
      const handler = result.modules.find(
        (m) => m.kind === 'segment' && m.segment.ctxName === '$',
      );
      if (handler?.kind !== 'segment') throw new Error('$ handler segment missing');
      // Outer param annotation stripped.
      expect(handler.code).not.toMatch(/\(items:\s*number\[\]\)/);
      // Inner param annotation stripped.
      expect(handler.code).not.toMatch(/\(x:\s*number\)/);
      // The bare names remain.
      expect(handler.code).toMatch(/items\.filter\(\s*\(x\)\s*=>/);
    });
  });

  describe('Negative scope: non-TS segments unaffected', () => {
    it('plain JS arrow (no annotations) → unchanged', () => {
      const result = transformDefault(`
import { component$, $ } from '@qwik.dev/core';
export const App = component$(() => {
  const handler = $((id) => console.log(id));
  return <div onClick$={handler}>x</div>;
});
`);
      const handler = result.modules.find(
        (m) => m.kind === 'segment' && m.segment.ctxName === '$',
      );
      if (handler?.kind !== 'segment') throw new Error('$ handler segment missing');
      expect(handler.code).toMatch(/=\s*\(\s*id\s*\)\s*=>/);
      // No double-strip artefacts (e.g. stray colons or empty parens).
      expect(handler.code).not.toMatch(/\(\s*\)\s*=>\s*console\.log\(id\)/);
    });
  });
});
