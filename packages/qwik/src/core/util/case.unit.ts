import { fromCamelToKebabCase, fromKebabToCamelCase } from './case';

describe('case', () => {
  describe('fromCamelToKebabCase', () => {
    it('should convert to kebab', () => {
      expect(fromCamelToKebabCase('HelloWorld')).toEqual('-hello-world');
      expect(fromCamelToKebabCase('on:ClicK')).toEqual('on:-clic-k');
      expect(fromCamelToKebabCase('a:b')).toEqual('a:b');
    });
  });

  describe('fromKebabToCamelCase', () => {
    it('should convert to camel', () => {
      expect(fromKebabToCamelCase('hello-world')).toEqual('helloWorld');
      expect(fromKebabToCamelCase('on:-clic-k')).toEqual('on:ClicK');
      expect(fromKebabToCamelCase('-hello-world')).toEqual('HelloWorld');
    });
  });
});
