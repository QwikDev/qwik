import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findSegments(result: { modules: readonly TransformModule[] }): readonly TransformModule[] {
  return result.modules.filter((m) => m.kind === 'segment');
}

describe('inline-strategy empty segment-file suppression', () => {
  it('non-stripped inline-strategy extraction emits NO segment file', () => {
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
      transpileTs: true,
      transpileJsx: true,
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
      transpileTs: true,
      transpileJsx: true,
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
      transpileTs: true,
      transpileJsx: true,
      stripCtxName: ['useClientMount$'],
      stripEventHandlers: true,
    });
    const segments = findSegments(result);
    const strippedCtxNames = segments
      .map((m) => (m.kind === 'segment' ? m.segment.ctxName : ''))
      .sort();
    for (const m of segments) {
      if (m.kind === 'segment') expect(m.code).toContain('= null');
    }
    expect(strippedCtxNames).not.toContain('useTask$');
    expect(strippedCtxNames).toContain('useClientMount$');
  });

  it('default (segment) strategy still emits a file per extraction (negative scope)', () => {
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
      transpileTs: true,
      transpileJsx: true,
    });
    const segments = findSegments(result);
    expect(segments.length).toBe(2);
    for (const m of segments) {
      if (m.kind === 'segment') expect(m.code.length).toBeGreaterThan(20);
    }
  });
});
