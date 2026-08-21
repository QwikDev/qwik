import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('a signal read before an await is not inlined past it', () => {
  // Inlining `base` would move the tracked read out of the invoke context.
  const code = `
import { createComputed$, createSignal } from '@qwik.dev/core';
export const make = (dep: any) =>
  createComputed$(async () => {
    const base = dep.value;
    await delay(1);
    return base * 10;
  });
`;
  const out = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'dev',
    isServer: true,
    entryStrategy: { type: 'hoist' },
  })
    .modules.map((m) => m.code)
    .join('\n');
  expect(out).toContain('const base = dep.value;');
  expect(out).toContain('base * 10');
});
