/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

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
      expect(fromKebabToCamelCase('hello-world')).toEqual('HelloWorld');
      expect(fromKebabToCamelCase('-hello-world')).toEqual('HelloWorld');
    });
  });
});
