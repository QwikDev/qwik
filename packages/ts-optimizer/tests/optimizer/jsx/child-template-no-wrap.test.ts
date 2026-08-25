import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

const transform = (code: string) =>
  transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'dev',
    entryStrategy: { type: 'hoist' },
  })
    .modules.map((m) => m.code)
    .join('\n');

it('a non-const template-literal child stays raw (rust parity)', () => {
  // Re-evaluating a hoisted template could repeat side effects (issue 4228).
  const code = `
import { component$ } from '@qwik.dev/core';
export const DisplayA = component$<{ counters: any }>(({ counters }) => {
  return <span>{\`\${counters.countA}:\${(window as any).countA++}\`}</span>;
});
`;
  const out = transform(code);
  expect(out).not.toContain('_fnSignal');
  expect(out).toContain('countA++');
});

it('a const-deps template-literal child still hoists', () => {
  const code = `
import { component$, useSignal } from '@qwik.dev/core';
export const Cmp = component$(() => {
  const sig = useSignal(1);
  return <span>{\`v:\${sig.value}\`}</span>;
});
`;
  const out = transform(code);
  expect(out).toContain('_fnSignal');
});
