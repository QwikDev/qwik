import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('const-folding expands shorthand properties and skips plain keys', () => {
  const code = `
import { component$, isServer, isBrowser } from '@qwik.dev/core';
export const Cmp = component$(() => {
  const state = { isServer, isBrowser, other: { isServer: 1 } };
  return <div>{JSON.stringify(state)}</div>;
});
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
  expect(allCode).toContain('isServer: true');
  expect(allCode).toContain('isBrowser: false');
  // A plain (non-shorthand) key is not a reference and must stay untouched.
  expect(allCode).toContain('isServer: 1');
  expect(allCode).not.toMatch(/\btrue\s*:\s*true\b/);
});

it('const-folding keeps re-exported build constants as bindings', () => {
  const code = `
import { isServer, isDev } from '@qwik.dev/core/build';
import { inlinedQrl } from '@qwik.dev/core';
const handler = () => isServer;
export const q = inlinedQrl(handler, 'q_handler');
export { isServer, isDev as dev };
`;
  const result = transformModule({
    input: [{ path: mkFilePath('lib.qwik.mjs'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    mode: 'dev',
    isServer: true,
    entryStrategy: { type: 'segment' },
  });
  const parent = result.modules.find((m) => m.kind === 'parent')!;
  expect(parent.code).toMatch(/export \{ isServer, isDev as dev \}/);
  expect(parent.code).toMatch(/import \{[^}]*isServer[^}]*\} from ['"]@qwik\.dev\/core\/build['"]/);
});
