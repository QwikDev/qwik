import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('a server$ body with captures unpacks them in the inline _regSymbol form', () => {
  const code = `
import { component$, useSignal, useTask$ } from '@qwik.dev/core';
import { server$ } from '@qwik.dev/router';
export default component$(() => {
  const isFavoriteSignal = useSignal(false);
  useTask$(({ track }) => {
    track(() => isFavoriteSignal.value);
    server$(() => {
      console.log('FAVORITE (server)', isFavoriteSignal.value);
    })();
  });
  return <div />;
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
    stripEventHandlers: true,
    regCtxName: ['server'],
  })
    .modules.map((m) => m.code)
    .join('\n');
  const i = out.indexOf('_regSymbol(');
  const body = out.slice(i, out.indexOf('.s(', i));
  expect(body).toContain('_captures[0]');
});

it('does not emit a stripped segment for an inline registered context', () => {
  const code = `
import { component$, server$ } from '@qwik.dev/core';
import { foo } from './foo';
export const Works = component$(() => {
  const text = 'hola';
  return <>
    <div onClick$={server$(() => console.log('server', text))}/>
    <div onClick$={() => foo()}/>
  </>;
});
`;
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    entryStrategy: { type: 'inline' },
    stripEventHandlers: true,
    regCtxName: ['server'],
  });

  expect(
    result.modules.some(
      (module) => module.kind === 'segment' && module.segment.displayName.endsWith('_server')
    )
  ).toBe(false);
});
