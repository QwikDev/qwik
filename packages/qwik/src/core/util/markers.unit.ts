import { describe, it, expect } from 'vitest';
import { ComponentStylesPrefixContent as PRE, addComponentStylePrefix } from './markers';

describe('markers', () => {
  it('sholud ignore falsy values', () => {
    expect(addComponentStylePrefix(null)).toBe(null);
    expect(addComponentStylePrefix(undefined)).toBe(null);
    expect(addComponentStylePrefix('')).toBe(null);
  });
  it('should append style prefix', () => {
    expect(addComponentStylePrefix('a')).toBe(PRE + 'a');
    expect(addComponentStylePrefix('a b')).toBe(PRE + 'a ' + PRE + 'b');
    expect(addComponentStylePrefix('long long')).toBe(PRE + 'long ' + PRE + 'long');
  });
});
