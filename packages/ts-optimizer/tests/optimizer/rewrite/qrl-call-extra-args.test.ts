import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('keeps arguments after the $ closure when rewriting to the Qrl form', () => {
  const code = `
import { component$, useStore, useVisibleTask$ } from '@qwik.dev/core';
export const Eager = component$(() => {
  const state = useStore({ msg: 'empty' });
  useVisibleTask$(
    () => {
      state.msg = 'run';
    },
    { strategy: 'document-ready' }
  );
  return <div id="eager-msg">{state.msg}</div>;
});
`;
  for (const isServer of [true, false]) {
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
      srcDir: mkFilePath('.'),
      transpileTs: true,
      transpileJsx: true,
      mode: 'dev',
      isServer,
      entryStrategy: isServer ? { type: 'hoist' } : { type: 'segment' },
      ...(isServer
        ? {
            stripCtxName: ['useVisibleTask'],
            stripEventHandlers: true,
          }
        : {}),
    });
    const allCode = result.modules.map((m) => m.code).join('\n');
    expect(allCode, `isServer=${isServer}`).toMatch(
      /useVisibleTaskQrl\([\s\S]*?strategy: ['"]document-ready['"]/
    );
  }
});
