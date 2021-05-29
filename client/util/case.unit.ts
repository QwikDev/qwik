/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { expect } from 'chai';
import { fromCamelToKebabCase, fromKebabToCamelCase } from './case.js';

describe('case', () => {
  describe('fromCamelToKebabCase', () => {
    it('should convert to kebab', () => {
      expect(fromCamelToKebabCase('HelloWorld')).to.equal('hello-world');
      expect(fromCamelToKebabCase('a:b')).to.equal('a:b');
    });
  });

  describe('fromKebabToCamelCase', () => {
    it('should convert to camel', () => {
      expect(fromKebabToCamelCase('hello-world')).to.equal('HelloWorld');
      expect(fromKebabToCamelCase('-hello-world')).to.equal('HelloWorld');
    });
  });
});
