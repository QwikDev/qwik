import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('stripped loop handlers keep their lexical captures via .w()', () => {
  // The noop body never runs on the server, but the serialized QRL must
  // still carry [sort] so the client segment's _captures resolve on resume.
  const code = `
import { component$, useSignal } from '@qwik.dev/core';
export const Cmp = component$(() => {
  const sort = useSignal('size');
  return (
    <tr>
      {['size', 'age', 'id'].map((c) => (
        <th
          key={c}
          onClick$={() => {
            sort.value = c;
          }}
        >
          {c}
        </th>
      ))}
    </tr>
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
  expect(allCode).toMatch(/q_qrl_\d+\.w\(\[\s*sort\s*\]\)/);
});

it('placement survives captures with type annotations containing semicolons', () => {
  const code = `
import { component$, useSignal } from '@qwik.dev/core';
const options = [{ id: 1 }, { id: 2 }];
export const Cmp = component$(() => {
  const selected = useSignal<{ id: number; src?: string }>(options[0]);
  return (
    <div>
      {options.map((d) => (
        <button key={d.id} onClick$={() => (selected.value = d)}>
          {d.id}
        </button>
      ))}
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
  expect(allCode).toMatch(/\.w\(\[\s*selected\s*\]\)/);
  expect(allCode).not.toContain('number;\nconst');
  expect(result.diagnostics).toEqual([]);
});
