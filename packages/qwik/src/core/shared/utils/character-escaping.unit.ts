import { describe, expect, it } from 'vitest';
import { _textValue } from './character-escaping';

describe('_textValue', () => {
  it('renders nullish and booleans as empty, everything else via String', () => {
    expect(_textValue(null)).toBe('');
    expect(_textValue(undefined)).toBe('');
    expect(_textValue(true)).toBe('');
    expect(_textValue(false)).toBe('');
    expect(_textValue(0)).toBe('0');
    expect(_textValue('')).toBe('');
    expect(_textValue('x')).toBe('x');
  });
});
