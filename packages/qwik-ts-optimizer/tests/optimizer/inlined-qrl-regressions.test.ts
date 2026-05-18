/**
 * Regression tests for `inlinedQrl` handling bugs surfaced by OSS-378
 * (`example_qwik_react`). These pin the production behavior of two specific
 * code paths so the underlying contracts don't silently regress under
 * snap-suite drift:
 *
 *   - Bug 1: `computeSegmentUsage` must attribute module-level references
 *     inside `inlinedQrl` extraction ranges to the segment (so migration
 *     fires MIG-02/03 and emits the `_auto_` re-export).
 *
 *   - Bug 2: the post-transform import re-collection's `*Qrl`-regex scan
 *     must not emit `import { X } from "@qwik.dev/core"` for arbitrary
 *     user-named identifiers that happen to end in `Qrl` (e.g. a function
 *     parameter named `reactCmpQrl`). Only legitimate Qwik runtime / source-
 *     imported `*Qrl` names should get the auto-import.
 *
 * Companion to convergence's `example_qwik_react`. See OSS-378.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../src/optimizer/types.js';

function findModule(modules: TransformModule[], pathSubstr: string): TransformModule | undefined {
  return modules.find((m) => m.path.includes(pathSubstr));
}

describe('inlinedQrl migration (OSS-378 Bug 1)', () => {
  it('attributes module-level decl references inside inlinedQrl bodies to the segment', () => {
    // Two inlinedQrl segments reference the same module-level `helper`.
    // Migration should fire MIG-02 (REEXPORT_MULTI_SEGMENT) and emit
    // `export { helper as _auto_helper };` in the parent.
    const input = `
import { componentQrl, inlinedQrl, useTaskQrl } from '@qwik.dev/core';

const helper = (v) => v * 2;

const Foo = componentQrl(inlinedQrl(() => {
    useTaskQrl(inlinedQrl(() => {
        return helper(1);
    }, "Foo_useWatch_aaa", []));
    return helper(2);
}, "Foo_component_bbb", []));
`;
    const result = transformModule({
      input: [{ path: 'test.ts', code: input }],
      srcDir: '.',
    });

    const parent = findModule(result.modules, 'test.ts');
    expect(parent?.code).toBeTruthy();
    expect(parent!.code).toContain('export { helper as _auto_helper }');

    // Each segment file should import `_auto_helper as helper`, not raw `helper`.
    const innerSeg = findModule(result.modules, 'Foo_useWatch_aaa');
    expect(innerSeg?.code).toBeTruthy();
    expect(innerSeg!.code).toContain('_auto_helper as helper');

    const outerSeg = findModule(result.modules, 'Foo_component_bbb');
    expect(outerSeg?.code).toBeTruthy();
    expect(outerSeg!.code).toContain('_auto_helper as helper');
  });

  it('still treats a module-level decl referenced only at root as KEEP (no _auto_ export)', () => {
    // Regression guard: the Bug 1 fix must not promote root-only references
    // into segment usage.
    const input = `
import { componentQrl, inlinedQrl } from '@qwik.dev/core';

const rootOnly = () => 1;
console.log(rootOnly());

const Foo = componentQrl(inlinedQrl(() => {
    return 42;
}, "Foo_component_ccc", []));
`;
    const result = transformModule({
      input: [{ path: 'test.ts', code: input }],
      srcDir: '.',
    });

    const parent = findModule(result.modules, 'test.ts');
    expect(parent?.code).toBeTruthy();
    // Root-only decls do not get an `_auto_` re-export.
    expect(parent!.code).not.toContain('_auto_rootOnly');
  });
});

describe('inlinedQrl segment imports (OSS-378 Bug 2)', () => {
  it('does not emit bogus `import { *Qrl } from "@qwik.dev/core"` for user-named identifiers', () => {
    // A function parameter named `reactCmpQrl` (a real qwik-react peer-tool
    // pattern) is captured by an inner segment. The post-transform regex scan
    // used to indiscriminately emit `import { reactCmpQrl } from "@qwik.dev/core"`
    // for any identifier ending in `Qrl` — that's wrong: `reactCmpQrl` is a
    // local binding, not a Qwik core export.
    const input = `
import { componentQrl, inlinedQrl } from '@qwik.dev/core';

function qwikifyQrl(reactCmpQrl) {
    return componentQrl(inlinedQrl((props) => {
        const [reactCmpQrl] = useLexicalScope();
        return reactCmpQrl.resolve();
    }, "qwikifyQrl_component_ddd", [reactCmpQrl]));
}
`;
    const result = transformModule({
      input: [{ path: 'test.ts', code: input }],
      srcDir: '.',
    });

    const seg = findModule(result.modules, 'qwikifyQrl_component_ddd');
    expect(seg?.code).toBeTruthy();
    // The exact bogus line we're guarding against. Anchored on the full
    // import statement so a legitimate `import { X, reactCmpQrl } from ...`
    // (if one were ever needed) wouldn't false-positive.
    expect(seg!.code).not.toContain('import { reactCmpQrl } from "@qwik.dev/core"');
  });

  it('still emits the legitimate `import { qrl }` for nested QRL declarations', () => {
    // Regression guard: the Bug 2 fix must not gate out legitimate Qwik
    // runtime imports like `qrl`, which the optimizer auto-adds when a
    // segment contains a nested QRL constant declaration.
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';

const Foo = component$(() => {
    useTask$(() => { console.log('inner'); });
});
`;
    const result = transformModule({
      input: [{ path: 'test.tsx', code: input }],
      srcDir: '.',
    });

    // The outer component segment carries the qrl const declaration for the
    // inner useTask, and therefore needs `import { qrl } from "@qwik.dev/core"`.
    const outerSeg = result.modules.find((m) => m.segment?.ctxName === 'component$');
    expect(outerSeg?.code).toBeTruthy();
    expect(outerSeg!.code).toMatch(/import\s*\{\s*qrl\s*\}\s*from\s*"@qwik\.dev\/core"/);
  });
});
