import { describe, expect, it } from 'vitest';
import { isHmrPathForFile } from './hmr';

describe('isHmrPathForFile', () => {
  it('matches an exact devPath', () => {
    expect(isHmrPathForFile('/src/foo.tsx', '/src/foo.tsx')).toBe(true);
  });

  it('matches the inspector `<file>:line:col` form', () => {
    expect(isHmrPathForFile('/src/foo.tsx:12:3', '/src/foo.tsx')).toBe(true);
  });

  it('matches a query-suffixed module-graph URL', () => {
    expect(isHmrPathForFile('/src/foo.tsx?v=123', '/src/foo.tsx')).toBe(true);
  });

  it('matches a segment chunk `<file>_<segment>.js` (repeated HMR reload)', () => {
    expect(isHmrPathForFile('/src/foo.tsx_foo_component_aBc123.js', '/src/foo.tsx')).toBe(true);
    expect(isHmrPathForFile('/src/foo.tsx_foo_component_aBc123.js?t=1', '/src/foo.tsx')).toBe(true);
  });

  it('does not match a prefix-sibling file (foo.ts vs foo.tsx)', () => {
    expect(isHmrPathForFile('/src/foo.tsx', '/src/foo.ts')).toBe(false);
    expect(isHmrPathForFile('/src/foo.tsx:1:1', '/src/foo.ts')).toBe(false);
    expect(isHmrPathForFile('/src/foo.tsx?v=1', '/src/foo.ts')).toBe(false);
    expect(isHmrPathForFile('/src/foo.tsx_foo_component_aBc123.js', '/src/foo.ts')).toBe(false);
  });

  it('does not match an unrelated file', () => {
    expect(isHmrPathForFile('/src/foo.tsx', '/src/bar.tsx')).toBe(false);
  });
});
