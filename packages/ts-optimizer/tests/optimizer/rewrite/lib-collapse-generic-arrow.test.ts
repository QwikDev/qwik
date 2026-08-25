import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('lib collapse survives a generic arrow elsewhere in the module', () => {
  // `<T>(...)` parses as JSX in .tsx — the collapse must not bail on it,
  // or the module keeps the non-re-extractable _noopQrl form.
  const code = `
import { createComputed$ } from '@qwik.dev/core';
export const wrapWithAbort = <T>(promise: Promise<T>): Promise<T> => promise;
export function makeSignal(dep: any) {
  return createComputed$(async () => dep.value * 2);
}
`;
  const out = transformModule({
    input: [{ path: mkFilePath('test.ts'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'lib',
    isServer: false,
    entryStrategy: { type: 'inline' },
  })
    .modules.map((m) => m.code)
    .join('\n');
  expect(out).toContain('inlinedQrl(');
  expect(out).not.toContain('_noopQrl(');
});
