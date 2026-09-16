import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('string-keyed destructured props use bracket access in q:p values', () => {
  const code = `
import { component$ } from '@qwik.dev/core';
export const Stories = component$(
  ({ 'bind:page': page }: { 'bind:page': { value: number } }) => (
    <button
      onClick$={() => {
        page.value += 1;
      }}
    >
      Next
    </button>
  )
);
`;
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'dev',
    isServer: true,
    entryStrategy: { type: 'hoist' },
  });
  const allCode = result.modules.map((m) => m.code).join('\n');
  expect(allCode).not.toMatch(/_rawProps\.bind:/);
  expect(result.diagnostics).toEqual([]);
});
