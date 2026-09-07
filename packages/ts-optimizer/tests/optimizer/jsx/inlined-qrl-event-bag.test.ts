import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('inlinedQrl event values go to the var bag, fully key-sorted', () => {
  const code = `
import { component$, inlinedQrl } from '@qwik.dev/core';
export const Cmp = component$(() => {
  return (
    <button
      onClick$={inlinedQrl(() => {}, 's_click2')}
      onBlur$={inlinedQrl(() => {}, 's_blur1')}
      document:onFocus$={inlinedQrl(() => {}, 's_documentFocus1')}
    >
      click
    </button>
  );
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
  const i = out.indexOf('_jsxSorted("button"');
  const call = out.slice(i, i + 220);
  // Runtime-call handlers are not static: var bag (arg 2), listeners bit clear.
  expect(call.replace(/\s+/g, ' ')).toContain(
    '_jsxSorted("button", { "q-d:focus": q_s_documentFocus1, "q-e:blur": q_s_blur1, "q-e:click": q_s_click2 }, null, "click", 2,'
  );
});
