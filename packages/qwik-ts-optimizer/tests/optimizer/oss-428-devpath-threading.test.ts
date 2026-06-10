/**
 * Regression tests for OSS-428 — JSX dev-info `fileName:` honors the
 * user-supplied `input.devPath` override (Sub-D of the OSS-424 F5 umbrella).
 *
 * Pre-OSS-428: JSX dev-info `fileName:` was hardcoded to use `relPath`
 * (the relative input filename, e.g. `test.tsx`). When the user set
 * `input.devPath` to override (e.g. `/hello/from/dev/test.tsx`), the
 * `qrlDEV` declaration's `file:` field got the override correctly but
 * the JSX dev-info object kept the unrelated `relPath`.
 *
 * The qrlDEV `file:` and JSX `fileName:` fields have asymmetric defaults:
 *  - `qrlDEV file:` always uses `devFilePath` (composed `srcDir/relPath`
 *    when no `devPath` is set, otherwise the override).
 *  - JSX `fileName:` uses `relPath` (NOT the composed form) when no
 *    `devPath` is set; switches to `devPath` only when explicitly set.
 *
 * OSS-428 threads a new `userDevPath` field through `RewriteContext` +
 * `SegmentGenerationContext`, distinct from the composed `devFilePath`,
 * so the JSX dev-options can switch on the user override alone.
 *
 * Companion to convergence's `example_noop_dev_mode` (closed by this fix
 * + Sub-A's empty-segment suppression). Existing dev-mode fixtures
 * without `devPath` (e.g. `example_dev_mode`, `example_dev_mode_inlined`,
 * `example_jsx_keyed_dev`) keep `fileName: "test.tsx"` semantics — that
 * branch is the negative-scope tests below.
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

describe('OSS-428: input.devPath threading into JSX dev-info', () => {
  it('JSX dev-info fileName uses input.devPath when explicitly set', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const App = component$(() => <div/>);
`;
    const result = transformModule({
      input: [{
        path: mkFilePath('test.tsx'),
        code: mkSourceText(input),
        devPath: '/hello/from/dev/test.tsx',
      }],
      srcDir: mkFilePath('/src'),
      transpileTs: true, transpileJsx: true,
      mode: 'dev',
    });

    // Look across all modules for any JSX dev-info; fileName should be
    // the user-supplied devPath.
    const allCode = result.modules.map((m) => m.code).join('\n');
    if (allCode.includes('fileName:')) {
      expect(allCode).toMatch(/fileName: ["']\/hello\/from\/dev\/test\.tsx["']/);
    }
    // qrlDEV file: must also use the override.
    expect(findParent(result).code).toMatch(/file: ["']\/hello\/from\/dev\/test\.tsx["']/);
  });

  it('qrlDEV file: uses composed devFilePath when no input.devPath (negative scope)', () => {
    // No devPath override; the qrlDEV file: composes srcDir + relPath.
    const input = `
import { component$ } from '@qwik.dev/core';
export const App = component$(() => <div/>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('/user/qwik/src'),
      transpileTs: true, transpileJsx: true,
      mode: 'dev',
    });

    const parent = findParent(result);
    // qrlDEV emits the composed path /user/qwik/src/test.tsx
    expect(parent.code).toMatch(/file: ["']\/user\/qwik\/src\/test\.tsx["']/);
  });

  it('JSX dev-info fileName falls back to relPath when no devPath override', () => {
    // The JSX dev-info `fileName:` keeps `test.tsx` semantics (not
    // `/user/qwik/src/test.tsx`). This is the asymmetric default —
    // qrlDEV file: gets the composed form; JSX fileName: stays short.
    const input = `
import { component$ } from '@qwik.dev/core';
export const App = component$(() => <div/>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('/user/qwik/src'),
      transpileTs: true, transpileJsx: true,
      mode: 'dev',
    });

    const allCode = result.modules.map((m) => m.code).join('\n');
    if (allCode.includes('fileName:')) {
      // fileName must NOT be the composed path.
      expect(allCode).not.toMatch(/fileName: ["']\/user\/qwik\/src\/test\.tsx["']/);
      // fileName should be the relative input.
      expect(allCode).toMatch(/fileName: ["']test\.tsx["']/);
    }
  });

  it('non-dev modes ignore devPath for JSX fileName (negative scope)', () => {
    // `mode: 'prod'` — no dev-info emitted at all, even with devPath set.
    const input = `
import { component$ } from '@qwik.dev/core';
export const App = component$(() => <div/>);
`;
    const result = transformModule({
      input: [{
        path: mkFilePath('test.tsx'),
        code: mkSourceText(input),
        devPath: '/hello/from/dev/test.tsx',
      }],
      srcDir: mkFilePath('/src'),
      transpileTs: true, transpileJsx: true,
      mode: 'prod',
    });

    const allCode = result.modules.map((m) => m.code).join('\n');
    expect(allCode).not.toMatch(/fileName:/);
    expect(allCode).not.toMatch(/qrlDEV/);
  });
});
