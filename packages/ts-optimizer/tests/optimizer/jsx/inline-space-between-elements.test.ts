import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('keeps the significant same-line space between sibling elements', () => {
  const code = `
import { component$, useSignal } from '@qwik.dev/core';
export const C = component$((props: { who: string }) => <b>{props.who}</b>);
export const Cmp = component$(() => {
  return (
    <span id="pair">
      <C who={'A'} /> <C who={'B'} />
    </span>
  );
});
`;
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'dev',
    isServer: false,
    entryStrategy: { type: 'segment' },
  });
  const allCode = result.modules.map((m) => m.code).join('\n');
  expect(allCode).toMatch(/\}\),\s*" ",/);
});
