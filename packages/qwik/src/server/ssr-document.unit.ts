import { describe, expect, it } from 'vitest';
import { createContainerOpenTag } from './ssr-document';

describe('createContainerOpenTag', () => {
  it('writes the container tag with escaped attribute values', () => {
    expect(createContainerOpenTag('div', { 'q:base': '/a"b', skipped: undefined! })).toBe(
      '<div q:base="/a&quot;b">'
    );
  });

  it('rejects a tag name that would break out of the tag', () => {
    expect(() => createContainerOpenTag('div><script', {})).toThrow();
  });

  it('rejects an attribute name that would break out of the tag in dev', () => {
    expect(() => createContainerOpenTag('div', { 'a><script': '' })).toThrow();
  });
});
