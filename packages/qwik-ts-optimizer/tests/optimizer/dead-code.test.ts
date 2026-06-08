/**
 * Tests for segment dead-code elimination (constant `if (true)` / `if (false)`
 * folding).
 */

import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { applySegmentDCE } from '../../src/optimizer/transform/dead-code.js';

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
    // The bug: both the outer `if (false)` and the inner `if (true)` were
    // collected in a single pass, then applied descending-by-start against the
    // same string. Applying the inner edit first shifted every offset after it,
    // leaving the outer fold's `end` index stale — its slice cut at the wrong
    // position and dropped a closing brace, producing unbalanced, unparseable
    // output. The fix skips folds nested inside an already-collected fold and
    // lets the iterative pass handle them once unnested.
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
    expect(
      parseSync('s.js', out).errors,
      `parse errors in:\n${out}`,
    ).toEqual([]);
    expect(out).toContain('live1()');
    expect(out).toContain('live2()');
    expect(out).not.toContain('dead()');
  });
});
