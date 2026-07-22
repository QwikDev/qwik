
import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('_hf<n>_str paren normalization for object-property values', () => {
  it('strips parens around `??` access in object-form _hf<n>_str', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 1+2}) => {
  return <div params={{some}}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/_hf0_str\s*=\s*["']\{some:p0\.some\?\?1\+2\}["']/);
    expect(code).not.toMatch(/_hf0_str\s*=\s*["']\{some:\(p0\.some\?\?1\+2\)\}["']/);
  });

  it('keeps bare-form _hf<n>_str unchanged (was already correct)', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 1+2}) => {
  return <div some={some}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/_hf0_str\s*=\s*["']p0\.some\?\?1\+2["']/);
  });

  it('preserves load-bearing parens in non-Property positions', () => {
    const input = `
import { component$, useStore } from '@qwik.dev/core';
export const C = component$(() => {
  const a = useStore({ value: 'a' });
  const b = useStore({ value: 'b' });
  return <div title={(a || b).value}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/_hf\d+_str\s*=\s*["'].*\(p0\|\|p1\)\.value/);
  });

  it('strips parens only at direct Property-value position (not transitively)', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 1+2}) => {
  return <div data={{ outer: { inner: some } }}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).not.toMatch(/_hf\d+_str\s*=\s*["']\S*\(p0\.some\?\?1\+2\)/);
  });
});
