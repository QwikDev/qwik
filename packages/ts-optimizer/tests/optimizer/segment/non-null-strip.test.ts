import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('strips a trailing non-null assertion from segment bodies', () => {
  const code = `
import { component$, useSignal, $ } from '@qwik.dev/core';
export const Cmp = component$(() => {
  const navSig = useSignal<string | undefined>('x');
  const go = $((v: string) => v);
  return <button onClick$={() => go(navSig.value!)}>go</button>;
});
`;
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'dev',
  });
  for (const m of result.modules) {
    expect(m.code, `TS non-null left in ${m.path}`).not.toMatch(/value!\)/);
  }
});
