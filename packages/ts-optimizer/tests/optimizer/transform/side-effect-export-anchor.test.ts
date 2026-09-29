import { it, expect } from 'vitest';
import { applySegmentSideEffectSimplification } from '../../../src/optimizer/transform/module-cleanup.js';

it('does not treat an export-shaped template line as the export block start', () => {
  const code =
    'const banner = `\nexport const q_x = 1\n`;\nconst unused = compute();\nexport const real = banner;\n';
  const out = applySegmentSideEffectSimplification(code, 'test.js');
  // `unused` sits before the real export block, so it is not eligible for
  // declaration-to-expression simplification.
  expect(out).toContain('const unused =');
});

it('still simplifies an unreferenced const after the real export start', () => {
  const code = 'export const real = 1;\nconst unused = compute();\n';
  const out = applySegmentSideEffectSimplification(code, 'test.js');
  expect(out).not.toContain('const unused =');
  expect(out).toContain('compute();');
});
