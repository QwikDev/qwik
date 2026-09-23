import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('collision renames skip identifiers inside replaced extraction ranges', () => {
  // A manual qrl() with a capture array shadowing an outer name crashed the
  // collision renamer with a MagicString double-edit.
  const code = `
import { component$, useSignal, useComputedQrl, qrl, _captures } from '@qwik.dev/core';
export function setup() {
  const Counter = component$(() => {
    const count = useSignal(123);
    const doubleCount = useComputedQrl<number>(
      qrl(
        () =>
          Promise.resolve({
            lazy: () => {
              const [count] = _captures as any;
              return count.value * 2;
            },
          }),
        'lazy',
        [count]
      )
    );
    return <div>{doubleCount.value}</div>;
  });
  return Counter;
}
`;
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'dev',
    isServer: true,
    entryStrategy: { type: 'hoist' },
  });
  expect(result.modules.length).toBeGreaterThan(0);
  expect(result.diagnostics).toEqual([]);
});
