import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('multi-capital event names emit as quoted keys, not broken JSX attrs', () => {
  // onDOMContentLoaded$ kebab-cases to q-d:-d-o-m-content-loaded, which is not
  // a parseable JSX attribute name — it must end up as a quoted object key.
  const code = `
import { component$, useSignal } from '@qwik.dev/core';
export const Counter = component$(() => {
  const count = useSignal(0);
  return (
    <button document:onDOMContentLoaded$={() => count.value++}>
      {count.value}
    </button>
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
  });
  const allCode = result.modules.map((m) => m.code).join('\n');
  expect(allCode).toContain('"q-d:-d-o-m-content-loaded":');
  expect(allCode).not.toMatch(/q-d:-d-o-m-content-loaded=\{/);
  expect(result.diagnostics).toEqual([]);
});
