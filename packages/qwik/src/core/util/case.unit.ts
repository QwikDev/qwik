import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { fromCamelToKebabCase } from './case';

const caseSuite = suite('case');
caseSuite('should convert to kebab', () => {
  equal(fromCamelToKebabCase('HelloWorld'), '-hello-world');
  equal(fromCamelToKebabCase('on:ClicK'), 'on:-clic-k');
  equal(fromCamelToKebabCase('a:b'), 'a:b');
});

caseSuite.run();
