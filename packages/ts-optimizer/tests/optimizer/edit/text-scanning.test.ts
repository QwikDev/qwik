import { describe, it, expect } from 'vitest';
import { skipStringLiteralForward } from '../../../src/optimizer/edit/text-scanning.js';
import { replaceOutsideStrings } from '../../../src/optimizer/edit/identifier-boundary.js';

describe('skipStringLiteralForward', () => {
  it('finds the closing backtick past a "}" inside an interpolated string', () => {
    const text = '`${f("}")}` rest';
    expect(skipStringLiteralForward(text, 0)).toBe(text.indexOf('` rest'));
  });

  it('handles nested template literals inside an interpolation', () => {
    const text = '`a${`b${c}`}d` rest';
    expect(skipStringLiteralForward(text, 0)).toBe(text.indexOf('` rest'));
  });

  it('ignores an unbalanced "{" inside an interpolated string', () => {
    const text = '`${"{"}` rest';
    expect(skipStringLiteralForward(text, 0)).toBe(text.indexOf('` rest'));
  });
});

describe('replaceOutsideStrings', () => {
  const pattern = /(?<![\w$.])Status\s*\.\s*Active(?![\w$])/g;

  it('replaces inside template interpolations but not in literal chunks', () => {
    const text = 'const s = `state: Status.Active is ${Status.Active}`;';
    expect(replaceOutsideStrings(text, pattern, '1')).toBe(
      'const s = `state: Status.Active is ${1}`;'
    );
  });

  it('recurses into nested templates in interpolations', () => {
    const text = 'const s = `${cond ? `${Status.Active}` : "Status.Active"}`;';
    expect(replaceOutsideStrings(text, pattern, '1')).toBe(
      'const s = `${cond ? `${1}` : "Status.Active"}`;'
    );
  });

  it('still protects plain strings and comments', () => {
    const text = 'use(Status.Active); // Status.Active\nconst t = "Status.Active";';
    expect(replaceOutsideStrings(text, pattern, '1')).toBe(
      'use(1); // Status.Active\nconst t = "Status.Active";'
    );
  });
});
