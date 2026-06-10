/**
 * Regression tests for OSS-425 — suppress empty segment-module files
 * under inline strategy (Sub-A of the OSS-424 F5 umbrella).
 *
 * Pre-OSS-425: `buildInlineStrategySegment` always returned a
 * `TransformModule`, so every extraction under inline / hoist strategy
 * produced a per-segment file — stripped ones got the `export const X = null`
 * stub, non-stripped ones got `code: ""`. SWC's reference emits a file
 * only for the stripped case; non-stripped bodies are inlined into the
 * parent via `q_X.s(body)` and need no companion file on disk.
 *
 * OSS-425 returns `null` from `buildInlineStrategySegment` when
 * `!stripped`, and the orchestrator filters those out. Stripped segments
 * still ship their `= null` stub (the runtime resolver still has to be
 * able to load that name).
 *
 * Negative-scope cases confirm:
 *  - Default (segment) entry strategy still emits a file per extraction
 *    (the new behavior is gated to inline strategy only).
 *  - Stripped + inline still emits the stub file.
 */

import { describe, it, expect } from 'vitest';
import { transformModule } from '../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

function findSegments(result: { modules: readonly TransformModule[] }): readonly TransformModule[] {
  return result.modules.filter((m) => m.kind === 'segment');
}

describe('OSS-425: inline-strategy empty segment-file suppression', () => {
  it('non-stripped inline-strategy extraction emits NO segment file', () => {
    // Three extractions, no strip config — under inline strategy all three
    // get inlined into the parent. Pre-OSS-425: 3 empty-body segment files.
    // Post-OSS-425: 0 segment files.
    const input = `
import { component$, useStore, useTask$ } from '@qwik.dev/core';
export const App = component$(() => {
  const state = useStore({ count: 0 });
  useTask$(() => { /* a */ });
  return <div onClick$={() => state.count++}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
      transpileTs: true, transpileJsx: true,
    });
    const segments = findSegments(result);
    expect(segments.length).toBe(0);
  });

  it('stripped + inline still emits the `= null` stub segment file', () => {
    const input = `
import { component$, useClientMount$, useStore } from '@qwik.dev/core';
export const App = component$(() => {
  const state = useStore({ count: 0 });
  useClientMount$(async () => { state.count = 1; });
  return <div/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
      transpileTs: true, transpileJsx: true,
      stripCtxName: ['useClientMount$'],
    });
    const segments = findSegments(result);
    expect(segments.length).toBe(1);
    expect(segments[0].kind).toBe('segment');
    if (segments[0].kind === 'segment') {
      expect(segments[0].segment.ctxName).toBe('useClientMount$');
      expect(segments[0].code).toContain('= null');
    }
  });

  it('mixed stripped + non-stripped under inline: only stripped get files', () => {
    // Mirrors the example_strip_client_code shape — multiple non-stripped
    // (useTask$, Div onClick$ that should keep, Div render$) plus stripped
    // (useClientMount$, shouldRemove$ via stripEventHandlers, parent
    // onClick$ via stripEventHandlers).
    const input = `
import { component$, useClientMount$, useStore, useTask$ } from '@qwik.dev/core';
export const Parent = component$(() => {
  const state = useStore({ text: '' });
  useClientMount$(async () => { state.text = 'a'; });
  useTask$(() => { /* keep */ });
  return (
    <div shouldRemove$={() => state.text} onClick$={() => state.text}>
      <Div onClick$={() => 'keep'} render$={() => state.text}/>
    </div>
  );
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
      transpileTs: true, transpileJsx: true,
      stripCtxName: ['useClientMount$'],
      stripEventHandlers: true,
    });
    const segments = findSegments(result);
    // 3 stripped: useClientMount$, shouldRemove$, parent onClick$.
    // (Div's onClick$ + render$ are also event handlers and so also
    // stripped under stripEventHandlers: true — useTask$ stays non-stripped
    // but body is inlined.)
    const strippedCtxNames = segments
      .map((m) => (m.kind === 'segment' ? m.segment.ctxName : ''))
      .sort();
    // Every segment file must have a non-empty stripped body.
    for (const m of segments) {
      if (m.kind === 'segment') expect(m.code).toContain('= null');
    }
    // Exactly the stripped ctxNames appear; no useTask$ ghost file.
    expect(strippedCtxNames).not.toContain('useTask$');
    expect(strippedCtxNames).toContain('useClientMount$');
  });

  it('default (segment) strategy still emits a file per extraction (negative scope)', () => {
    // Pre-OSS-425 behavior preserved for non-inline strategies. Segment
    // strategy emits one file per extraction regardless of stripping.
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';
export const App = component$(() => {
  useTask$(() => { /* a */ });
  return <div/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'segment' },
      transpileTs: true, transpileJsx: true,
    });
    const segments = findSegments(result);
    // 2 segments: component$ + useTask$. Both have non-empty bodies.
    expect(segments.length).toBe(2);
    for (const m of segments) {
      if (m.kind === 'segment') expect(m.code.length).toBeGreaterThan(20);
    }
  });
});
