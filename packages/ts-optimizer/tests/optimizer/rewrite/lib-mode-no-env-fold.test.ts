import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('lib mode never folds isServer/isBrowser even when isServer is set', () => {
  // The shipped lib serves BOTH environments; the app build folds later
  // (rust parity: parse.rs skips ConstReplacerVisitor for EmitMode::Lib).
  const code = `
import { component$, useTask$, isServer, isBrowser } from '@qwik.dev/core';
export function guardOnServer(x: number) {
  if (isServer) {
    return x + 1;
  }
  return x;
}
export const Cmp = component$(() => {
  useTask$(() => {
    if (isServer) {
      console.log('server side');
    } else {
      console.log('client side');
    }
  }, { deferUpdates: isServer });
  return <div>{isBrowser ? 'b' : 's'}</div>;
});
`;
  const out = transformModule({
    input: [{ path: mkFilePath('index.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'lib',
    isServer: true,
    entryStrategy: { type: 'inline' },
  })
    .modules.map((m) => m.code)
    .join('\n');
  expect(out).toContain('server side');
  expect(out).toContain('client side');
  expect(out).toContain('deferUpdates: isServer');
  expect(out).toMatch(/if \(isServer\) \{\s*return x \+ 1;/);
});
