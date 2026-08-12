import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('the hoist path keeps the passive scope on promoted handlers', () => {
  const code = `
import { component$, useStore } from '@qwik.dev/core';
export const Passive = component$(() => {
  const store = useStore({ n: 0 });
  return (
    <div>
      <button id="passive-click" passive:click onClick$={() => store.n++}>
        Passive click
      </button>
      <p>{store.n}</p>
    </div>
  );
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
    stripCtxName: ['useVisibleTask'],
    stripEventHandlers: true,
  });
  const allCode = result.modules.map((m) => m.code).join('\n');
  expect(allCode).toContain('"q-ep:click"');
  expect(allCode).not.toContain('"q-e:click"');
});
