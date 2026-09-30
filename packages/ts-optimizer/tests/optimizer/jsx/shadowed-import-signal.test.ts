import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('a local shadowing an import still hoists a fnSignal child', () => {
  // `jsx` is both imported and locally declared as a signal — the local wins.
  const code = `
import { jsx, component$, useSignal } from '@qwik.dev/core';
it('t', async () => {
  const Counter = component$(() => {
    const jsx = useSignal(1);
    const show = useSignal(false);
    return <button>{show.value ? jsx.value : 'hidden'}</button>;
  });
  await render(<Counter />, {});
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
  expect(out).toContain('_fnSignal(_hf0, [jsx, show], _hf0_str)');
});
