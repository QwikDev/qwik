/**
 * Regression tests for OSS-430 — moved-decl JSX rewrite preservation
 * (Sub-A of the OSS-429 F6 umbrella).
 *
 * Pre-OSS-430: when migration's MIG-01 MOVE action relocated a
 * module-level helper function (single-segment use) into a segment
 * file, the JSX inside the moved function used the RAW source text —
 * never having received Qwik's JSX-syntax-to-`_jsxSorted`/`_jsxSplit`
 * rewrite. The raw JSX then fell through to `oxcTransformSync`'s
 * default JSX transform, which emitted React's `_jsx("div", { ...props })`
 * along with a spurious `import { jsx as _jsx } from "react/jsx-runtime"` —
 * wrong runtime entirely.
 *
 * The case that originally exposed this: `function Hola(props) {
 *   return <div {...props}/>; }` declared at module level, referenced
 * once from a `component$` body. Migration moves Hola into the segment
 * file; the JSX inside survives raw.
 *
 * Fix:
 *   1. `rewriteParentModule` captures a post-`runJsxTransform` snapshot
 *      of each moved decl's source range via `ctx.s.slice(start, end)`
 *      before assembly. Exposed as `ParentRewriteResult.movedDeclSnapshots`
 *      (`Map<string, string>`, keyed by varName).
 *   2. `wireMigration` in `segment-generation.ts` prefers the snapshot
 *      over the raw `decl.declText` when emitting the moved declaration.
 *   3. `ensureCoreImports` in `segment-codegen.ts` includes moved-decl
 *      text in its scan and force-ensures the `//` separator exists
 *      (otherwise the early-return at `sepIdx < 0` skipped adding
 *      `_jsxSplit`/`_getVarProps`/`_getConstProps` for our case).
 *
 * Companion to convergence's `should_split_spread_props_with_additional_prop5`
 * (target test for Sub-A — flips with this fix alone).
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../src/optimizer/types.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

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

describe('OSS-430: moved-decl JSX carries Qwik rewrite into the segment file', () => {
  it('pure-spread JSX in a moved helper compiles to `_jsxSplit` (not React `_jsx`)', () => {
    const input = `
import { component$ } from '@qwik.dev/core';

function Hola(props: any) {
  return <div {...props}></div>;
}

export default component$(() => {
  return <Hola>
    <div>1</div>
    <div>2</div>
  </Hola>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true, transpileJsx: true,
    });

    const seg = findSegmentByCtx(result, 'component$');
    // The moved Hola helper uses Qwik's _jsxSplit with var/const split,
    // NOT React's _jsx form.
    expect(seg.code).toMatch(/_jsxSplit\("div", \{ \.\.\._getVarProps\(props\) \}, _getConstProps\(props\)/);
    expect(seg.code).not.toMatch(/_jsx\("div", \{ \.\.\.props \}\)/);
    expect(seg.code).not.toMatch(/from ["']react\/jsx-runtime["']/);
  });

  it('Qwik core helpers used by the moved decl get imported into the segment', () => {
    // Without the ensureCoreImports + separator-guarantee fix, the new
    // `_jsxSplit` / `_getVarProps` / `_getConstProps` references in the
    // moved Hola helper would survive without imports — broken runtime.
    const input = `
import { component$ } from '@qwik.dev/core';
function Hola(props: any) { return <div {...props}/>; }
export default component$(() => <Hola/>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true, transpileJsx: true,
    });

    const seg = findSegmentByCtx(result, 'component$');
    expect(seg.code).toMatch(/import \{ _jsxSplit \} from ["']@qwik\.dev\/core["']/);
    expect(seg.code).toMatch(/import \{ _getVarProps \} from ["']@qwik\.dev\/core["']/);
    expect(seg.code).toMatch(/import \{ _getConstProps \} from ["']@qwik\.dev\/core["']/);
  });

  it('non-spread JSX in a moved helper still gets rewritten (positive coverage)', () => {
    // Same MOVE path, but the helper uses non-spread JSX. Confirms the
    // snapshot-carries-rewrite contract is general — not specific to
    // the spread case.
    const input = `
import { component$ } from '@qwik.dev/core';
function Greet({ name }: any) { return <span>Hello {name}</span>; }
export default component$(() => <Greet name="World"/>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true, transpileJsx: true,
    });

    const seg = findSegmentByCtx(result, 'component$');
    // Greet's JSX uses Qwik's _jsxSorted, no React _jsx fall-through.
    expect(seg.code).toMatch(/_jsxSorted\("span"/);
    expect(seg.code).not.toMatch(/from ["']react\/jsx-runtime["']/);
  });

  it('fixtures without moved decls keep current behavior (negative scope)', () => {
    // Plain component$ body with no module-level helper to move.
    // Confirms `movedDeclSnapshots` being empty doesn't change emission.
    const input = `
import { component$ } from '@qwik.dev/core';
export default component$(() => <div>hello</div>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true, transpileJsx: true,
    });

    const seg = findSegmentByCtx(result, 'component$');
    // Standard Qwik JSX rewrite for the component$ body; no change.
    expect(seg.code).toMatch(/_jsxSorted\("div"/);
    expect(seg.code).not.toMatch(/from ["']react\/jsx-runtime["']/);
  });
});
