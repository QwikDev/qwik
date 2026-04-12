import { describe, it, expect } from 'vitest';
import { compareAst } from '../../src/testing/ast-compare.js';

describe('real compareAst', () => {
  it('simplest merge', () => {
    const a = `_jsxSplit("b", { a: 1 }, _getConstProps(p), null, 0, "k")`;
    const b = `_jsxSplit("b", { a: 1, ..._getConstProps(p) }, null, null, 0, "k")`;
    expect(compareAst(a, b, 'test.tsx').match).toBe(true);
  });

  it('with imports', () => {
    const a = `import { _jsxSplit } from "@qwik.dev/core";\nimport { _getConstProps } from "@qwik.dev/core";\nexport const f = () => _jsxSplit("b", { a: 1 }, _getConstProps(p), null, 0, "k")`;
    const b = `import { _jsxSplit } from "@qwik.dev/core";\nimport { _getConstProps } from "@qwik.dev/core";\nexport const f = () => _jsxSplit("b", { a: 1, ..._getConstProps(p) }, null, null, 0, "k")`;
    expect(compareAst(a, b, 'test.tsx').match).toBe(true);
  });
});
