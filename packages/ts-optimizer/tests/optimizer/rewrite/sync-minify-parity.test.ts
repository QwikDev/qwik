import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('sync$ serialization minifies like rust', () => {
  const code = `
import { sync$ } from '@qwik.dev/core';
export const ping = sync$(() => {
  const seen = new Set();
  const items = [1].map((x) => x + 1);
  const stamp = new Date().getTime();
  const has = 'message' in ({} as any);
  return [seen, items, stamp, has];
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
  const serialized = out.match(/_qrlSync\([^,]+(?:[^)]|\)[^;])*"(.*)"\)/)?.[1] ?? out;
  expect(serialized).toContain('new Set;');
  expect(serialized).toContain('map(x=>x+1)');
  expect(serialized).toContain('new Date().getTime()');
  expect(serialized).toContain('\\"message\\"in');
});
