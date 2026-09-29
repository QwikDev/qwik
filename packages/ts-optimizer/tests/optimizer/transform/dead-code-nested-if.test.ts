import { it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { applySegmentDCE } from '../../../src/optimizer/transform/dead-code.js';

it('does not mangle a dead if guarding a nested if/else', () => {
  const code = `const f = () => {
  if (false) if (visible) {
    el.setAttribute("a", "");
    el.removeAttribute("b");
  } else {
    el.removeAttribute("a");
    el.setAttribute("b", "");
  }
  return visible;
};`;
  const out = applySegmentDCE(code);
  const parsed = parseSync('t.tsx', out);
  expect(parsed.errors).toEqual([]);
});
