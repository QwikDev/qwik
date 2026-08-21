import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function parentCode(source: string): string {
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'inline' },
    transpileTs: true,
    transpileJsx: true,
  });
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) {
    throw new Error('parent module not found');
  }
  return parent.code;
}

const LF_SOURCE = `
import { component$ } from '@qwik.dev/core';
export const C = component$(() => {
  return (
    <div>
      Hello
      <span>world</span>
      !
    </div>
  );
});
`;

// A Windows checkout has no .gitattributes normalizing these files, so the
// optimizer sees CRLF and must fold it exactly like LF.
describe('JSX text normalization is line-ending agnostic', () => {
  it('produces identical output for CRLF and LF sources', () => {
    expect(parentCode(LF_SOURCE.replace(/\n/g, '\r\n'))).toBe(parentCode(LF_SOURCE));
  });

  it('leaves no carriage return in the emitted text', () => {
    expect(parentCode(LF_SOURCE.replace(/\n/g, '\r\n'))).not.toContain('\\r');
  });

  it('folds a lone-CR source the same way', () => {
    expect(parentCode(LF_SOURCE.replace(/\n/g, '\r'))).toBe(parentCode(LF_SOURCE));
  });
});
