import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('ref props are never hoisted into _fnSignal', () => {
  // applyRef writes the element into the ref value; a hoisted _fnSignal is a
  // read-only WrappedSignal and throws Q31 when the element is (re)created.
  const code = `
import { component$, useSignal } from '@qwik.dev/core';
export const Cmp = component$(() => {
  const toggle = useSignal(true);
  const ref = useSignal<HTMLDivElement>();
  return (
    <div id="result" ref={toggle.value ? ref : undefined}>
      {toggle.value ? 'Hello' : 'world'}
    </div>
  );
});
`;
  for (const isServer of [false, true]) {
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
      srcDir: mkFilePath('.'),
      transpileTs: true,
      transpileJsx: true,
      mode: 'dev',
      isServer,
      entryStrategy: isServer ? { type: 'hoist' } : { type: 'segment' },
    });
    const allCode = result.modules.map((m) => m.code).join('\n');
    expect(allCode, `isServer=${isServer}`).toMatch(
      /ref: toggle\.value \? ref : (undefined|void 0)/
    );
  }
});
