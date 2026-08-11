import { describe, it, expect } from 'vitest';
import { applySegmentConstReplacement } from '../../../src/optimizer/transform/module-cleanup.js';

describe('applySegmentConstReplacement', () => {
  it('expands shorthand object properties instead of corrupting them', () => {
    const code = [
      "import { isServer } from '@qwik.dev/core';",
      'export const platform = { isServer, other: 1 };',
    ].join('\n');
    const out = applySegmentConstReplacement(code, 'test.ts', true);
    expect(out).toContain('{ isServer: true, other: 1 }');
  });

  it('replaces plain references', () => {
    const code = ["import { isServer } from '@qwik.dev/core';", 'if (isServer) { a(); }'].join(
      '\n'
    );
    const out = applySegmentConstReplacement(code, 'test.ts', false);
    expect(out).toContain('if (false)');
  });
});
