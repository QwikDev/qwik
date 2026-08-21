import { it, expect } from 'vitest';
import { buildSyncTransform } from '../../../src/optimizer/rewrite/rewrite-calls.js';

it('sync$ serialization never rewrites string contents', () => {
  const out = buildSyncTransform(`(e) => {
  location.href = "https://x.dev/a";
  e.target.title = "a  b";
  e.target.dataset.x = "a, b";
  const s = "/* keep */";
}`);
  expect(out).toContain('https://x.dev/a');
  expect(out).toContain('a  b');
  expect(out).toContain('a, b');
  expect(out).toContain('/* keep */');
});

it('sync$ serialization still strips real comments and spaces', () => {
  const out = buildSyncTransform(`(e) => {
  // a comment
  /* block */
  e.preventDefault();
}`);
  const serialized = out.slice(out.lastIndexOf(', "') + 2);
  expect(serialized).not.toContain('a comment');
  expect(serialized).not.toContain('block');
  expect(serialized).toContain('e.preventDefault()');
});
