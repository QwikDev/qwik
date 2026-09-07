import { it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('fnSignal serialized strings contain no TypeScript syntax', () => {
  // The `_str` form executes via the container qFuncs script; a leaked
  // `as any` cast is a page-wide SyntaxError at resume.
  const code = `
import { component$, useStore } from '@qwik.dev/core';
export const Cmp = component$(() => {
  const state = useStore({ counters: { countA: 0 } });
  return (
    <div>
      {\`\${state.counters.countA}:\${
        typeof (globalThis as any).countA === 'number' ? (window as any).countA++ : 0
      }\`}
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
  });
  for (const m of result.modules) {
    for (const [, str] of m.code.matchAll(/const _hf\d+_str = (.*);/g)) {
      expect(str, `serialized fnSignal in ${m.path}`).not.toMatch(/\bas any\b|\bas\s+unknown\b/);
    }
  }
});
