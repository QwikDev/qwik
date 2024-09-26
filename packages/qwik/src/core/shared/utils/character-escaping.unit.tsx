import { describe, expect, it } from 'vitest';
import { escapeHTML } from './character-escaping';

describe('character-escaping', () => {
  it('escapeHTML', () => {
    expect(escapeHTML('text')).toEqual('text');
    expect(escapeHTML('<div a=\'b\' c="d">text')).toEqual(
      '&lt;div a=&#39;b&#39; c=&quot;d&quot;&gt;text'
    );
  });
});
