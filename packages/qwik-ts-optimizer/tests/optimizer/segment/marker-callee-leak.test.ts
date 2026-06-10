/**
 * Regression tests for eliminating spurious marker re-imports in
 * extracted segments (part of the F5 server-marker stripping work).
 *
 * Pre-fix: when an extraction's body was the argument of a marker call
 * (`$(() => { ... })`, `client$(() => { ... })`, `useTask$(() => { ... })`),
 * the surrounding marker callee identifier (`$` / `client$` / `useTask$`)
 * leaked into the extracted segment's `bodyIds` set. Downstream import
 * collection then emitted a spurious `import { $ } from "@qwik.dev/core"`
 * (or analogous) in the segment file, even though the segment's body text
 * never references the marker.
 *
 * Root cause: the Identifier-tagging in `extract.ts:495` walked
 * every Identifier inside the enclosing CallExpression (which is the
 * `leaveNode` for the active segment frame) and unconditionally tagged
 * into the segment's bodyIds. But the segment's body is the *function
 * argument* (`seg.root`), not the surrounding CallExpression. The callee
 * Identifier sits between the two.
 *
 * Fix: gate the Identifier tagging on `nodeContainedIn(node, seg.root)`
 * — the same predicate the JSX-detection arm already uses just below.
 * O(1) byte-offset check; same parent-context awareness.
 *
 * Affects `example_strip_server_code` and `example_noop_dev_mode` in
 * convergence (the inner `$()`, `client$()`, and standalone `useTask$()`
 * extractions). The fix does not flip a test on its own (those fixtures
 * have other independent divergences) but eliminates the spurious-import
 * class of bug across the strip-mode surface and beyond.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

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

describe('marker callee no longer leaks into extracted segment imports', () => {
  it('inner $() segment does not re-import the bare $ marker', () => {
    // The inner `$()` extraction body is `() => { /* a */ }`. Pre-fix:
    // segment file emitted `import { $ } from "@qwik.dev/core"` because
    // the callee `$` was tagged into the segment's bodyIds.
    const input = `
import { component$, serverStuff$, $ } from '@qwik.dev/core';
export const App = component$(() => {
  serverStuff$(() => {
    const a = $(() => { /* a */ });
    return a;
  });
  return <div/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true, transpileJsx: true,
      stripCtxName: ['server'],
      entryStrategy: { type: 'segment' },
    });

    const inner = findSegmentByCtx(result, '$');
    expect(inner.code).not.toMatch(/import \{[^}]*\$[^}]*\} from ["']@qwik\.dev\/core["']/);
  });

  it('client$ segment does not re-import client$', () => {
    const input = `
import { component$, serverStuff$, client$ } from '@qwik.dev/core';
export const App = component$(() => {
  serverStuff$(() => {
    const b = client$(() => { /* b */ });
    return b;
  });
  return <div/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true, transpileJsx: true,
      stripCtxName: ['server'],
      entryStrategy: { type: 'segment' },
    });

    const clientSeg = findSegmentByCtx(result, 'client$');
    expect(clientSeg.code).not.toMatch(/import \{[^}]*\bclient\$[^}]*\} from/);
  });

  it('extracted useTask$ segment does not re-import useTask$', () => {
    // Multiple useTask$ calls — the second one (when extracted) was
    // re-importing useTask$ into its segment file pre-fix.
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';
export const App = component$(() => {
  useTask$(() => { /* a */ });
  useTask$(() => { /* b */ });
  return <div/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true, transpileJsx: true,
      entryStrategy: { type: 'segment' },
    });

    const useTaskSegments = result.modules.filter(
      (m) => m.kind === 'segment' && m.segment.ctxName === 'useTask$',
    );
    expect(useTaskSegments.length).toBeGreaterThan(0);
    for (const seg of useTaskSegments) {
      expect(seg.code).not.toMatch(/import \{[^}]*\buseTask\$[^}]*\} from/);
    }
  });

  it('identifiers genuinely referenced inside the body ARE still imported (negative scope)', () => {
    // Confirm the gate doesn't accidentally drop legitimate imports the
    // body actually uses — `mongo` is referenced inside the body and
    // must still be imported into the segment file.
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';
import mongo from 'mongodb';
export const App = component$(() => {
  useTask$(async () => {
    await mongo.users();
  });
  return <div/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true, transpileJsx: true,
      entryStrategy: { type: 'segment' },
    });

    const useTaskSeg = findSegmentByCtx(result, 'useTask$');
    expect(useTaskSeg.code).toMatch(/import mongo from ["']mongodb["']/);
  });
});
