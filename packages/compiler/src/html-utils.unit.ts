import { describe, expect, test } from 'vitest';
import { serializeAttrValue } from './html-utils';

describe('serializeAttrValue', () => {
  test('matches boolean attribute semantics after name normalization', () => {
    expect(serializeAttrValue('hidden', false)).toBeNull();
    expect(serializeAttrValue('hidden', true)).toBe('');
    expect(serializeAttrValue('ARIA-hidden', false)).toBe('false');
    expect(serializeAttrValue('aria-busy', true)).toBe('true');
    expect(serializeAttrValue('Draggable', false)).toBe('false');
    expect(serializeAttrValue('contentEditable', true)).toBe('true');
    expect(serializeAttrValue('title', null)).toBeNull();
    expect(serializeAttrValue('tabindex', 0)).toBe('0');
  });
});
