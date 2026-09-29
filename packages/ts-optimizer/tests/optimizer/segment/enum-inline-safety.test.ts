import { it, expect } from 'vitest';
import { inlineEnumReferences } from '../../../src/optimizer/segment/body-transforms.js';

const enums = new Map([['Status', new Map([['Active', '"active"']])]]);

it('inlines a real enum member reference', () => {
  expect(inlineEnumReferences('log(Status.Active);', enums)).toBe('log("active");');
});

it('never rewrites member paths, strings, or comments', () => {
  const body = [
    'log(config.Status.Active);',
    'const t = "Status.Active";',
    'const u = `x ${Status.Active} Status.Active`;',
    '// Status.Active in a comment',
  ].join('\n');
  const out = inlineEnumReferences(body, enums);
  expect(out).toContain('config.Status.Active');
  expect(out).toContain('"Status.Active"');
  // Interpolation contents are code (rust inlines there); literal chunks are data.
  expect(out).toContain('${"active"}');
  expect(out).toContain('} Status.Active`');
  expect(out).toContain('// Status.Active in a comment');
});
