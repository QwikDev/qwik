import { assert, test } from 'vitest';
import { fromCamelToKebabCase } from './case';

test('should convert to kebab', () => {
  assert.equal(fromCamelToKebabCase('HelloWorld'), '-hello-world');
  assert.equal(fromCamelToKebabCase('on:ClicK'), 'on:-clic-k');
  assert.equal(fromCamelToKebabCase('a:b'), 'a:b');
});
