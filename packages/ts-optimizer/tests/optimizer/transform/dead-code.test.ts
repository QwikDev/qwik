import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { applySegmentDCE } from '../../../src/optimizer/transform/dead-code.js';

function braceCounts(code: string): [number, number] {
  return [(code.match(/\{/g) || []).length, (code.match(/\}/g) || []).length];
}

describe('applySegmentDCE', () => {
  it('folds a constant-true branch, dropping the dead path', () => {
    const out = applySegmentDCE('if (true) {\n  live();\n} else {\n  dead();\n}');
    expect(out).toContain('live()');
    expect(out).not.toContain('dead()');
  });

  it('folds a nested fold inside a folded branch without corrupting braces', () => {
    const code = [
      'export const s_x = () => {',
      '  if (false) {',
      '    dead();',
      '  } else {',
      '    if (true) {',
      '      live1();',
      '    }',
      '    live2();',
      '  }',
      '};',
    ].join('\n');

    const out = applySegmentDCE(code);

    const [open, close] = braceCounts(out);
    expect(open, `unbalanced braces in:\n${out}`).toBe(close);
    expect(parseSync('s.js', out).errors, `parse errors in:\n${out}`).toEqual([]);
    expect(out).toContain('live1()');
    expect(out).toContain('live2()');
    expect(out).not.toContain('dead()');
  });
});
