import { fromCamelToKebabCase, fromKebabToCamelCase } from './case';

describe('case', () => {
  describe('fromCamelToKebabCase', () => {
    it('should convert to kebab', () => {
      expect(fromCamelToKebabCase('HelloWorld')).toEqual('hello-world');
      expect(fromCamelToKebabCase('a:b')).toEqual('a:b');
    });
  });

  describe('fromKebabToCamelCase', () => {
    it('should convert to camel', () => {
      expect(fromKebabToCamelCase('hello-world')).toEqual('helloWorld');
      expect(fromKebabToCamelCase('-hello-world')).toEqual('HelloWorld');
    });
  });
});
