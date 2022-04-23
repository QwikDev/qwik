import { caseInsensitiveCompare } from './string';

describe('string', () => {
  it('should caseInsensitiveCompare', () => {
    expect(caseInsensitiveCompare(null, null)).toEqual(false);
    expect(caseInsensitiveCompare('a', null)).toEqual(false);
    expect(caseInsensitiveCompare(null, 'b')).toEqual(false);
    expect(caseInsensitiveCompare('a', 'bb')).toEqual(false);

    expect(caseInsensitiveCompare('a', 'a')).toEqual(true);
    expect(caseInsensitiveCompare('aBc', 'AbC')).toEqual(true);
  });
});
