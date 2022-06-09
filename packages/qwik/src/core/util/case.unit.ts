import { fromCamelToKebabCase } from './case';

describe('case', () => {
  describe('fromCamelToKebabCase', () => {
    it('should convert to kebab', () => {
      expect(fromCamelToKebabCase('HelloWorld')).toEqual('-hello-world');
      expect(fromCamelToKebabCase('on:ClicK')).toEqual('on:-clic-k');
      expect(fromCamelToKebabCase('a:b')).toEqual('a:b');
    });
  });
});
