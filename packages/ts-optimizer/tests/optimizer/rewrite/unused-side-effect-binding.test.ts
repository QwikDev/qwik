import { expect, it } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('keeps only the effect of an unused binding shadowed inside a segment', () => {
  const input = `
import { $ } from '@qwik.dev/core';
import { translate } from 'i18n';
const t = translate();
const used = translate();
console.log(used);
export const action = $(() => {
  try { return ok(); } catch {
    const t = translate();
    return t('error');
  }
});
`;
  const result = transformModule({
    input: [{ path: mkFilePath('test.ts'), code: mkSourceText(input) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    entryStrategy: { type: 'segment' },
    minify: 'simplify',
  });
  const parent = result.modules.find((module) => module.kind === 'parent');

  expect(parent?.code).toContain('translate();');
  expect(parent?.code).not.toContain('const t = translate();');
  expect(parent?.code).toContain('const used = translate();');
});
