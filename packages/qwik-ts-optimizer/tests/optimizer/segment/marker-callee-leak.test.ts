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
