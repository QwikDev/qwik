import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('hook context destructures consolidate to _rawProps in the hoist path', () => {
  // `cleanup` is a method on the compute context; the bare destructured call
  // loses `this`, so the body must consolidate to `_rawProps.cleanup(...)`.
  const code = `
import { component$, useComputed$ } from '@qwik.dev/core';
export const Child = component$(() => {
  const asyncValue = useComputed$(async ({ cleanup }) => {
    cleanup(() => {});
    return 1;
  });
  return <div>{asyncValue.value}</div>;
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
  });
  const allCode = result.modules.map((m) => m.code).join('\n');
  expect(allCode).toMatch(/_rawProps\.cleanup\(/);
  expect(allCode).not.toMatch(/\(\{ cleanup \}\)/);
});
