/**
 * Regression tests for OSS-404 — path normalization + F1c emit ordering
 * for inline self-ref components.
 *
 * Three coupled bugs surfaced in `root_level_self_referential_qrl_inline`:
 *
 *   1. **Path normalization**: `computeRelPath` stripped a user-provided
 *      `./` prefix via `normalize()`. SWC's hash function uses the
 *      user-provided shape; stripping the `./` produced TS-vs-SWC hash
 *      divergence + dev-info `fileName:` field divergence.
 *
 *   2. **Absolute file path**: `buildDevFilePath` concatenated `srcDir`
 *      with the raw inputPath (preserving `./`), producing
 *      `/user/qwik/src/./node_modules/...` instead of
 *      `/user/qwik/src/node_modules/...`. Fix: strip leading `./` from
 *      inputPath before concatenation.
 *
 *   3. **F1c emit ordering**: for self-referential components under
 *      Inline strategy, the `.s(body)` call must come AFTER the
 *      `export const Tree = componentQrl(...)` statement so the body's
 *      reference to `Tree` doesn't TDZ at module load. Ported from
 *      stale `ast-parity/F2` branch commit 534ddd4.
 *
 * Companion to convergence's `root_level_self_referential_qrl_inline`.
 */

import { describe, it, expect } from 'vitest';
import { computeRelPath } from '../../src/optimizer/path-utils.js';
import { buildDevFilePath } from '../../src/optimizer/dev-mode.js';
import { transformModule } from '../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../src/optimizer/types.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('OSS-404 — path normalization preserves leading ./', () => {
  it('computeRelPath preserves leading ./ when input has it', () => {
    // SWC uses the user-provided path shape for hash input + dev-info.
    // Stripping the `./` here would diverge from SWC's hash output.
    const result = computeRelPath(
      mkFilePath('./node_modules/qwik-tree/index.qwik.jsx'),
      mkFilePath('/user/qwik/src/'),
    );
    expect(result).toBe('./node_modules/qwik-tree/index.qwik.jsx');
  });

  it('computeRelPath leaves input without ./ unchanged', () => {
    const result = computeRelPath(
      mkFilePath('test.tsx'),
      mkFilePath('/user/qwik/src/'),
    );
    // No leading ./ in input → no leading ./ in output.
    expect(result).toBe('test.tsx');
    expect(result.startsWith('./')).toBe(false);
  });

  it('buildDevFilePath strips leading ./ from inputPath before concat', () => {
    // Pre-fix: `/user/qwik/src/./node_modules/...` (stray /./)
    // Post-fix: `/user/qwik/src/node_modules/...`
    const result = buildDevFilePath(
      './node_modules/qwik-tree/index.qwik.jsx',
      '/user/qwik/src/',
    );
    expect(result).toBe('/user/qwik/src/node_modules/qwik-tree/index.qwik.jsx');
    expect(result).not.toContain('/./');
  });

  it('buildDevFilePath without ./ input still works', () => {
    const result = buildDevFilePath(
      'node_modules/qwik-tree/index.qwik.jsx',
      '/user/qwik/src/',
    );
    expect(result).toBe('/user/qwik/src/node_modules/qwik-tree/index.qwik.jsx');
  });
});

describe('OSS-404 — F1c emit ordering for self-referential components', () => {
  it('emits export const Tree BEFORE q_Tree.s(body) for self-ref under Inline', () => {
    // Without this fix, q_Tree.s((props) => <Tree/>) runs at module load
    // before `Tree` is initialized, TDZ-ing the body's self-reference.
    // The fix partitions sCalls by whether their body string references
    // an exported componentQrl name; referencing calls go AFTER the export.
    const input = `
import { component$ } from '@qwik.dev/core';

export const Tree = component$((props) => {
  return <div>{props.children && props.children.map((child) => <Tree {...child} />)}</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('./test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('/user/qwik/src/'),
      entryStrategy: { type: 'inline' },
      transpileJsx: true,
    });

    const parent = findParent(result);
    const code = parent.code;

    // Find positions of `export const Tree =` and `q_Tree...s(` in output.
    const exportIdx = code.search(/export\s+const\s+Tree\s*=/);
    // Match either form: `q_Tree_<hash>.s(` (the new shape) or `q_s_<hash>.s(`
    // (prod-rename shape). Both should appear AFTER the export.
    const sCallIdx = code.search(/q_\w+\.s\(/);

    expect(exportIdx).toBeGreaterThanOrEqual(0);
    expect(sCallIdx).toBeGreaterThanOrEqual(0);
    // The export must come BEFORE the .s() call so the body's `Tree`
    // reference is initialized at module load.
    expect(exportIdx).toBeLessThan(sCallIdx);
  });

  it('non-self-ref components keep .s() BEFORE the export (original ordering preserved)', () => {
    // The F1c partition only moves sCalls whose body references an exported
    // componentQrl name. Bodies that DON'T reference such names keep the
    // pre-fix ordering (sCall before export). Verify the non-self-ref case
    // doesn't shift unexpectedly.
    const input = `
import { component$ } from '@qwik.dev/core';

export const Foo = component$((props) => {
  return <div>plain content, no self-reference</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('./test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('/user/qwik/src/'),
      entryStrategy: { type: 'inline' },
      transpileJsx: true,
    });

    const parent = findParent(result);
    const code = parent.code;
    const exportIdx = code.search(/export\s+const\s+Foo\s*=/);
    const sCallIdx = code.search(/q_\w+\.s\(/);
    expect(exportIdx).toBeGreaterThanOrEqual(0);
    expect(sCallIdx).toBeGreaterThanOrEqual(0);
    // Body doesn't reference `Foo` → .s() can stay BEFORE the export.
    expect(sCallIdx).toBeLessThan(exportIdx);
  });
});
