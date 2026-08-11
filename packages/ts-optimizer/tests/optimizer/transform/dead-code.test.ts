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

  it('keeps the else clause when its body has a comment with an apostrophe', () => {
    const code = [
      'if (false) {',
      '  dead();',
      '} else {',
      "  // Don't await — goto re-runs this",
      '  live();',
      '}',
      'after();',
    ].join('\n');

    const out = applySegmentDCE(code);

    const [open, close] = braceCounts(out);
    expect(open, `unbalanced braces in:\n${out}`).toBe(close);
    expect(parseSync('s.js', out).errors, `parse errors in:\n${out}`).toEqual([]);
    expect(out).toContain('live()');
    expect(out).not.toContain('dead()');
    expect(out).toContain('after()');
  });

  it('never drops an if while leaving its else dangling, even when unparseable', () => {
    const code = ['if (false) {', '  dead();', '} else {', '  broken( // {', '}'].join('\n');

    const out = applySegmentDCE(code);

    expect(out.replace(/\}\s*else/g, 'X')).not.toMatch(/(^|[^}])\s*else\b/m);
  });

  it('does not fold boolean literals used as comparison operands', () => {
    const code = [
      'const a = x !== false && y;',
      'const b = x === false || y;',
      'const c = x !== true && y;',
      'const s = "p0.fallback!==false&&(p2.value)?1:2";',
    ].join('\n');

    const out = applySegmentDCE(code);

    expect(out).toContain('x !== false && y');
    expect(out).toContain('x === false || y');
    expect(out).toContain('x !== true && y');
    expect(out).toContain('"p0.fallback!==false&&(p2.value)?1:2"');
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
