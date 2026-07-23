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
      const handler = result.modules.find((m) => m.kind === 'segment' && m.segment.ctxName === '$');
      if (handler?.kind !== 'segment') throw new Error('$ handler segment missing');
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
      const handler = result.modules.find((m) => m.kind === 'segment' && m.segment.ctxName === '$');
      if (handler?.kind !== 'segment') throw new Error('$ handler segment missing');
      expect(handler.code).not.toMatch(/:\s*number/);
      expect(handler.code).not.toMatch(/:\s*string/);
      expect(handler.code).not.toMatch(/:\s*boolean/);
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
      const handler = result.modules.find((m) => m.kind === 'segment' && m.segment.ctxName === '$');
      if (handler?.kind !== 'segment') throw new Error('$ handler segment missing');
      expect(handler.code).not.toMatch(/\(items:\s*number\[\]\)/);
      expect(handler.code).not.toMatch(/\(x:\s*number\)/);
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
      const handler = result.modules.find((m) => m.kind === 'segment' && m.segment.ctxName === '$');
      if (handler?.kind !== 'segment') throw new Error('$ handler segment missing');
      expect(handler.code).toMatch(/=\s*\(\s*id\s*\)\s*=>/);
      expect(handler.code).not.toMatch(/\(\s*\)\s*=>\s*console\.log\(id\)/);
    });
  });
});
