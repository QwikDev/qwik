import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('keeps module-level decls in files without extractions', () => {
  // With zero extractions the gather walk skips usage classification, so
  // migration must not treat every non-exported decl as unreferenced.
  const code = `
import { NAME_A, NAME_B } from './constants';
const urls = { version: 1 };
export const bundled = {
  [NAME_A]: urls,
  [NAME_B]: urls,
};
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
  const out = result.modules[0].code;
  expect(out).toContain('urls = {');
  expect(out).toContain('NAME_A');
});
