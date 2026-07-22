import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';
import {
  foldBodySimplifiableExpressions,
} from '../../../src/optimizer/jsx/simplify.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('segment-body default folding (post-JSX-transform pass)', () => {
  it('folds `?? 1+2` → `?? 3` in component body where raw-props injected the default', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({stuff: hey, some = 1+2}) => {
  console.log(hey, some);
  return <div some={some}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/console\.log\([^)]*_rawProps\.some\s*\?\?\s*3/);
    expect(code).not.toMatch(/console\.log\([^)]*_rawProps\.some\s*\?\?\s*1\s*\+\s*2/);
  });

  it('folds `?? 1+2` in nested useTask body too', () => {
    const input = `
import { component$, useTask$ } from '@qwik.dev/core';
export const C = component$(({count, some = 1+2}) => {
  useTask$(({track}) => {
    track(() => count);
    console.log(count, some);
  });
  return <div class={count}>{count}</div>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/_rawProps\.some\s*\?\?\s*3/);
    expect(code).not.toMatch(/_rawProps\.some\s*\?\?\s*1\s*\+\s*2/);
  });

  it('keeps `_hf<n>_str` source-preserving (the architectural conflict the post-pass timing resolves)', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(({some = 1+2}) => {
  console.log(some);
  return <div some={some} params={{some}}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/"p0\.some\?\?1\+2"/);
    expect(code).toMatch(/"\{some:p0\.some\?\?1\+2\}"/);
    expect(code).toMatch(/_hf0\s*=\s*\(p0\)\s*=>\s*p0\.some\s*\?\?\s*3/);
    expect(code).toMatch(/console\.log\(\(?_rawProps\.some\s*\?\?\s*3\)?/);
  });

  it('leaves non-foldable `?? <expr>` RHS untouched (negative-scope)', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
const SENTINEL = 42;
export const C = component$(({val = SENTINEL}) => {
  console.log(val);
  return <div/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      entryStrategy: { type: 'inline' },
    });

    const code = findParent(result).code;
    expect(code).toMatch(/_rawProps\.val\s*\?\?\s*SENTINEL/);
    expect(code).toMatch(/SENTINEL\s*=\s*42/);
  });

  it('does NOT re-canonicalize existing string literals (skipLiterals: true)', () => {
    const before = `(_rawProps) => {
  console.log("count", "div", "click");
  return _jsxSorted("div", null, null, "hello", 3, "u6_0");
}`;
    const after = foldBodySimplifiableExpressions(before);
    expect(after).toContain('"count"');
    expect(after).toContain('"div"');
    expect(after).toContain('"click"');
    expect(after).toContain('"hello"');
    expect(after).toContain('"u6_0"');
    expect(after).not.toContain("'count'");
    expect(after).not.toContain("'div'");
  });

  it('folds bare nested expressions outside any `??`', () => {
    const before = `(_rawProps) => {
  const a = 1 + 2;
  const b = !false;
  const c = true ? "yes" : "no";
  return [a, b, c];
}`;
    const after = foldBodySimplifiableExpressions(before);
    expect(after).toMatch(/const a = 3\b/);
    expect(after).toMatch(/const b = true\b/);
    expect(after).toMatch(/const c = 'yes'/);
  });
});
