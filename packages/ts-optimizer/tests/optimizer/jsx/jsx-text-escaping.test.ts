import { it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('escapes quotes and backslashes in JSX text children', () => {
  const code = `import { component$ } from '@qwik.dev/core';
export default component$(() => {
  return <p>Say "hi" and \\ backslash</p>;
});
`;
  const res = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: '/x/src',
    transpileTs: true,
    transpileJsx: true,
    mode: 'test',
    entryStrategy: { type: 'segment' },
  } as any);
  for (const m of res.modules) {
    expect(parseSync('m.tsx', m.code).errors, m.code).toEqual([]);
  }
});

it('decodes character references in JSX text and attributes', () => {
  const code = `export const Hero = () => (
  <h1 title="Auto&shy;matically">Auto&shy;matically</h1>
);`;
  const res = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: '/x/src',
    transpileTs: true,
    transpileJsx: true,
  } as any);
  const output = res.modules.map((module) => module.code).join('\n');

  expect(output).not.toContain('&shy;');
  expect(output).toContain('Auto\u00admatically');
});
