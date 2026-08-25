import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function parentCode(input: string): string {
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'inline' },
  });
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) {
    throw new Error('parent module not found');
  }
  return parent.code;
}

describe('_fnSignal serialized body preserves string-literal contents', () => {
  it('keeps a ",}" inside a string literal in the hoisted _str', () => {
    const code = parentCode(`
import { component$ } from '@qwik.dev/core';
export const C = component$((props) => {
  return <div title={props.name + ',}'}/>;
});
`);
    // The trailing-comma scrub must not eat the comma inside the string data.
    expect(code).toMatch(/_hf0_str\s*=\s*["'].*,\\?[}]/);
  });

  it('still strips a real trailing comma before a closer', () => {
    const code = parentCode(`
import { component$ } from '@qwik.dev/core';
export const C = component$((props) => {
  return <div params={{ a: props.a, }}/>;
});
`);
    expect(code).toMatch(/_hf0_str/);
    expect(code).not.toMatch(/_hf0_str\s*=\s*["'].*,\s*[}]/);
  });
});
