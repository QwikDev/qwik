import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('bare-expression _fnSignal hoist for defaulted prop', () => {
  it('hoists `some={some}` to _fnSignal when `some` is defaulted', () => {
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
    expect(code).toMatch(/const _hf0\b[^=]*=\s*\(p0\)\s*=>\s*p0\.some\s*\?\?\s*3/);
    expect(code).toMatch(/_hf0_str\s*=\s*["']p0\.some\?\?1\+2["']/);
    expect(code).toMatch(/some:\s*_fnSignal\(_hf0,\s*\[_rawProps\],\s*_hf0_str\)/);
    expect(code).not.toMatch(/some:\s*_rawProps\.some\s*\?\?\s*1\s*\+\s*2/);
  });

  it('still uses _wrapProp for non-defaulted destructure prop locals', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({count}) => {
  return <div class={count}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/class:\s*_wrapProp\(_rawProps,\s*["']count["']\)/);
    expect(code).not.toMatch(/class:\s*_fnSignal/);
  });

  it('unwraps ParenthesizedExpression in JSX prop values from non-rawProps sources', () => {
    const input = `
import { component$, useStore } from '@qwik.dev/core';
export const C = component$(() => {
  const a = useStore({ x: 1 });
  const b = useStore({ y: 2 });
  return <div prop={(a.x + b.y)}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toContain('_fnSignal');
  });

  it('hoists separately when both bare and object forms of the same defaulted local appear', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 1+2}) => {
  return <div some={some} params={{some}}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/const _hf0\b[^=]*=\s*\(p0\)\s*=>\s*p0\.some\s*\?\?\s*3/);
    expect(code).toMatch(
      /const _hf1\b[^=]*=\s*\(p0\)\s*=>\s*\(?\{\s*some:\s*\(?p0\.some\s*\?\?\s*3/
    );
    expect(code).toMatch(/some:\s*_fnSignal\(_hf0,/);
    expect(code).toMatch(/params:\s*_fnSignal\(_hf1,/);
  });
});
