import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('a handler referencing its component-segment captures receives them via q:ps', () => {
  // OtherA/OtherB reach Child through its own `.w()` captures; the click
  // handler must get them positionally, not as dangling module refs.
  const code = `
import { component$, useSignal } from '@qwik.dev/core';
it('x', async () => {
  const OtherA = component$(() => <b>a</b>);
  const OtherB = component$(() => <b>b</b>);
  const Child = component$(() => {
    const content = useSignal<any[]>([]);
    return <button onClick$={() => { content.value = [OtherA, OtherB]; }}>go</button>;
  });
  await render(<Child />, {});
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
  expect(out).toMatch(/q_e_click[A-Za-z0-9_]* = \(_, _1, OtherA, OtherB, content\)/);
  expect(out).toContain('"q:ps": [');
});
