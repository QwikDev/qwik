import { it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it('props destructure folding leaves the param type annotation intact', () => {
  const code = `
import { component$ } from '@qwik.dev/core';
type Menu = { text: string };
export const Node = component$(
  (props: { section: Menu; pathname: string }) => {
    const { section, pathname } = props;
    if (!section.text) { return null; }
    return <div title={pathname}>{section.text}</div>;
  }
);
`;
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    mode: 'dev',
    isServer: true,
    entryStrategy: { type: 'hoist' },
    transpileTs: true,
    transpileJsx: true,
  });
  for (const m of result.modules) {
    expect(m.code).not.toContain('props.section:');
    const parsed = parseSync('out.tsx', m.code);
    expect(parsed.errors, `invalid output in ${m.path}`).toEqual([]);
  }
});
