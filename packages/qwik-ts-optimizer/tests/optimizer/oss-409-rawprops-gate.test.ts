/**
 * Regression tests for OSS-409 bugs 1+2 — tighten `_rawProps` consolidation
 * gate + propagate destructure-time defaults to nested segment bodies.
 *
 * Pre-fix bugs:
 *
 * **Bug 1 (consolidation gate)** — TS unconditionally consolidated any
 * ObjectPattern first param to `(_rawProps)` + field rewrites, even when
 * the destructure had shapes SWC's `transform_pat` rejects via `skip = true`
 * (`swc-reference-only/props_destructuring.rs:371-470`):
 *   - A KeyValue property whose value is a nested ObjectPattern / ArrayPattern
 *     (e.g. `({stuff: {hey}})`) — SWC preserves the source destructure
 *     because the field-rewrite walker can't express `hey → _rawProps.stuff.hey`.
 *   - A property with an AssignmentPattern default whose right side contains
 *     a CallExpression (e.g. `({stuff = hola()})`) — SWC's `is_const_expr`
 *     gate marks calls as non-const, aborting consolidation.
 *
 * **Bug 2 (default propagation)** — when a child segment captured a prop
 * field that the parent destructure defaulted (`some = 1+2`), the nested
 * rewrite emitted bare `_rawProps.<key>` instead of
 * `(_rawProps.<key> ?? <default>)`. SWC emits the NullishCoalescing form
 * (`props_destructuring.rs:382-388 + 442-451`) so the runtime applies the
 * default the same way the parent body would.
 *
 * Companion to convergence's `example_props_optimization` (3 components):
 *   - Works:    flat destructure with defaults → consolidates + defaults propagate
 *   - NoWorks2: nested `stuff: {hey}` → preserved verbatim (bug 1)
 *   - NoWorks3: call default `stuff = hola()` → preserved verbatim (bug 1)
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

describe('OSS-409 bug 1: consolidation gate preserves unsafe destructures', () => {
  it('preserves nested ObjectPattern field (NoWorks2 shape)', () => {
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';

export const C = component$(({count, stuff: {hey}}) => {
  console.log(hey);
  useTask$(({track}) => {
    track(() => count);
    console.log(count);
  });
  return <div class={count}>{count}</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;

    // Component body keeps the source destructure pattern verbatim.
    expect(code).toMatch(/\(\{\s*count,\s*stuff:\s*\{\s*hey\s*\}\s*\}\)\s*=>/);
    // No (_rawProps) consolidation.
    expect(code).not.toMatch(/\(_rawProps\)\s*=>/);
    // `hey` reference survives (it would be undefined under broken consolidation).
    expect(code).toContain('console.log(hey)');
    // useTask captures `count` (not `_rawProps`).
    expect(code).toMatch(/\.w\(\[\s*count\s*\]\)/);
  });

  it('preserves call-expression default (NoWorks3 shape)', () => {
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';
import { hola } from 'some-lib';

export const C = component$(({count, stuff = hola()}) => {
  console.log(stuff);
  useTask$(({track}) => {
    track(() => count);
    console.log(count);
  });
  return <div class={count}>{count}</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;

    // Component body keeps the source destructure pattern verbatim.
    expect(code).toMatch(/\(\{\s*count,\s*stuff\s*=\s*hola\(\)\s*\}\)\s*=>/);
    expect(code).not.toMatch(/\(_rawProps\)\s*=>/);
    expect(code).toContain('console.log(stuff)');
    expect(code).toMatch(/\.w\(\[\s*count\s*\]\)/);
  });

  it('still consolidates flat destructure with const defaults (parity-safe)', () => {
    // Counter-test: ensure the gate change doesn't over-broaden — Works's
    // shape (flat destructure with literal/Identifier defaults) MUST still
    // consolidate. SWC's `is_const_expr` allows BinaryExpression of Literals
    // (`1+2`) and imported Identifiers (`CONST`).
    const input = `
import { component$ } from '@qwik.dev/core';

export const C = component$(({count, some = 1+2}) => {
  return <div>{count}{some}</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // Consolidates to (_rawProps).
    expect(code).toMatch(/\(_rawProps\)\s*=>/);
    // `count` reaches into _rawProps (may go via _wrapProp(_rawProps, "count")
    // for Signal-style reactive access in JSX child position).
    expect(code).toMatch(/_rawProps[.,)"]\s*(?:["'])?count/);
    // Defaulted access carries `?? 1+2` (formatting may add spaces — match either).
    expect(code).toMatch(/_rawProps\.some\s*\?\?\s*1\s*\+\s*2/);
  });
});

describe('OSS-409 bug 2: destructure defaults propagate to nested segment bodies', () => {
  it('emits `(_rawProps.<key> ?? <default>)` in nested useTask body', () => {
    // Mirror of Works's useTask$ — references to defaulted parent locals
    // should carry the `?? <default>` fallback in the nested body too.
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';

export const C = component$(({count, some = 1+2, stuffDefault: hey2 = 123}) => {
  useTask$(({track}) => {
    track(() => count);
    console.log(count, some, hey2);
  });
  return <div class={count}>{count}</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;

    // The nested useTask body should reference _rawProps.some with `?? 1+2`
    // and _rawProps.stuffDefault with `?? 123` — matching SWC's
    // NullishCoalescing emission for defaulted fields.
    expect(code).toMatch(/_rawProps\.some\s*\?\?\s*1\s*\+\s*2/);
    expect(code).toMatch(/_rawProps\.stuffDefault\s*\?\?\s*123/);
    // _rawProps.count has no default — bare access (no `??`).
    expect(code).toMatch(/_rawProps\.count[^?]/);
  });

  it('omits `??` for non-defaulted fields', () => {
    // Negative-scope test: when a captured field has NO destructure default,
    // the nested rewrite must emit bare `_rawProps.<key>` (no spurious `??`).
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';

export const C = component$(({count, plain}) => {
  useTask$(({track}) => {
    track(() => count);
    console.log(count, plain);
  });
  return <div>{count}</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // Both fields bare — no `??` introduced for either.
    expect(code).not.toMatch(/_rawProps\.count\s*\?\?/);
    expect(code).not.toMatch(/_rawProps\.plain\s*\?\?/);
  });

  it('does not apply defaults when consolidation aborted (gate cascade)', () => {
    // When the parent's destructure has an unsafe shape (bug 1 case),
    // no defaults map should be threaded — the nested body never references
    // `_rawProps.<key>` because consolidation didn't fire.
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';
import { hola } from 'some-lib';

export const C = component$(({count, stuff = hola()}) => {
  useTask$(({track}) => {
    track(() => count);
    console.log(count);
  });
  return <div>{count}</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    // No _rawProps references anywhere — consolidation aborted at the gate.
    expect(code).not.toContain('_rawProps');
    // Source destructure preserved.
    expect(code).toMatch(/\(\{\s*count,\s*stuff\s*=\s*hola\(\)\s*\}\)\s*=>/);
  });
});
