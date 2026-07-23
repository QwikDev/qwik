import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('_fnSignal lambda body folds primitive-operand subtrees', () => {
  it('folds BinaryExpression with literal operands in lambda body', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 1+2}) => {
  return <div params={{ some }}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;

    expect(code).toMatch(/const _hf0\b[^=]*=[^;]*p0\.some\s*\?\?\s*3/);
    expect(code).not.toMatch(/const _hf0\b[^=]*=[^;]*p0\.some\s*\?\?\s*1\s*\+\s*2/);
    expect(code).toMatch(/_hf0_str\s*=\s*["']\S*1\+2/);
  });

  it('folds nested simplifiable subtree leaving non-simplifiable parents intact', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 2*3}) => {
  return <div params={{ some }}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/const _hf0\b[^=]*=[^;]*p0\.some\s*\?\?\s*6/);
    expect(code).toMatch(/_hf0_str\s*=\s*["']\S*2\*3/);
  });

  it('skips no-op replacement when source already matches simplified form', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 3}) => {
  return <div params={{ some }}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/const _hf0\b[^=]*=[^;]*p0\.some\s*\?\?\s*3/);
    expect(code).toMatch(/_hf0_str\s*=\s*["']\S*\?\?3/);
  });

  it('leaves non-simplifiable MemberExpression operands untouched', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some, other}) => {
  return <div params={{ result: some + other }}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/const _hf0\b[^=]*=[^;]*p0\.some\s*\+\s*p0\.other/);
  });

  it('does not regress _str format when the simplifiable test arm is a literal', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some, stuffDefault: hey2 = 123}) => {
  return <div params={{ some, hey2 }}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/const _hf0\b[^=]*=[^;]*p0\.stuffDefault\s*\?\?\s*123/);
    expect(code).toMatch(/_hf0_str\s*=\s*["']\S*\?\?123/);
  });
});
