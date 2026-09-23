import { it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('hoists an object-literal marker body without block reparse damage', () => {
  const code = `
import { routeAction$, z, zod$ } from '@qwik.dev/router';
export const useAct = routeAction$(async () => ({ value: 42 }), zod$({ name: z.string() }));
`;
  const result = transformModule({
    input: [{ path: mkFilePath('routes/index.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    mode: 'dev',
    isServer: true,
    entryStrategy: { type: 'hoist' },
    transpileTs: false,
    transpileJsx: true,
  });
  for (const m of result.modules) {
    const parsed = parseSync('out.tsx', m.code);
    expect(parsed.errors, `invalid output in ${m.path}`).toEqual([]);
    expect(m.code).not.toContain('z.string();');
  }
});
