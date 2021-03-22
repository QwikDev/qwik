/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { keyToServiceAttribute } from '../injection/element_injector.js';
import { validateKeyPart, keyToProps, propsToKey } from './service_key.js';
import { ServiceType } from './types.js';

describe('service key', () => {
  const MissingKeyPropsService: ServiceType<any> = class MissingKeyPropsService {
    static $name = 'missingService';
  } as any;
  const MockService: ServiceType<any> = class MockService {
    static $keyProps = ['a', 'propB', 'c'];
    static $name = 'myService';
  } as any;
  const EmptyService: ServiceType<any> = class EmptyService {
    static $keyProps = [];
    static $name = 'emptyService';
  } as any;
  describe('propsToKey', () => {
    it('should convert prop to key', () => {
      expect(propsToKey(MockService, {})).to.eql('my-service:::');
      expect(propsToKey(MockService, { a: 12 })).to.eql('my-service:12::');
      expect(propsToKey(MockService, { a: 12, propB: 3, c: 4 })).to.eql('my-service:12:3:4');
      expect(propsToKey(MockService, { a: null, propB: undefined, c: 4 })).to.eql('my-service:::4');
      expect(propsToKey(MockService, { a: 'A', propB: 'aA' })).to.eql('my-service:-a:a-a:');
    });

    it('should error', () => {
      expect(() => propsToKey(MissingKeyPropsService, {})).to.throw(
        `SERVICE-ERROR(Q-311): Service 'MissingKeyPropsService' does not define '$keyProps'.`
      );
      expect(() => propsToKey(MockService, { a: '.' })).to.throw(
        `SERVICE-ERROR(Q-303): '.' is not a valid attribute. Attributes can only contain 'a-z' (lowercase), '0-9', '-' and '_'.`
      );
    });
  });

  describe('keyToProps', () => {
    it('should convert key', () => {
      expect(keyToProps(MockService, `my-service:1:234:56`)).to.eql({
        a: '1',
        propB: '234',
        c: '56',
      });
      expect(keyToProps(MockService, `my-service:1:234`)).to.eql({ a: '1', propB: '234', c: null });
      expect(keyToProps(MockService, `my-service:-a:a-a:-a-a`)).to.eql({
        a: 'A',
        propB: 'aA',
        c: 'AA',
      });
      expect(keyToProps(MockService, `my-service:1`)).to.eql({ a: '1', propB: null, c: null });
      expect(keyToProps(MockService, `my-service:`)).to.eql({ a: null, propB: null, c: null });
      expect(keyToProps(MockService, `my-service::`)).to.eql({ a: '', propB: null, c: null });
      expect(keyToProps(EmptyService, `empty-service:`)).to.eql({});
    });
    it('should error', () => {
      expect(() => keyToProps(MissingKeyPropsService, `my-service::`)).to.throw(
        `SERVICE-ERROR(Q-311): Service 'MissingKeyPropsService' does not define '$keyProps'.`
      );
      expect(() => keyToProps(MockService, `my-service`)).to.throw(
        `SERVICE-ERROR(Q-309): Service key 'my-service' is missing values. Expecting 'my-service:someValue'.`
      );
      expect(() => keyToProps(MockService, `other-service:`)).to.throw(
        `SERVICE-ERROR(Q-315): Key 'other-service:' belongs to service named 'other-service', but expected service 'MockService' with name 'my-service'.`
      );
      expect(() => keyToProps(MockService, `my-service::::`)).to.throw(
        `SERVICE-ERROR(Q-314): Service 'MockService' defines '$keyProps' as  '["a","propB","c"]'. Actual key 'my-service::::' has more parts than service defines.`
      );
    });
  });

  describe('keyToServiceName', () => {
    it('should extract service name', () => {
      expect(keyToServiceAttribute('foo:')).to.eql('::foo');
      expect(keyToServiceAttribute('bar:baz')).to.eql('::bar');
      expect(keyToServiceAttribute('bar:baz:qoot')).to.eql('::bar');
      expect(keyToServiceAttribute(':')).to.eql('::');
    });
    it('should complain on bad format', () => {
      expect(() => keyToServiceAttribute('foo')).to.throw(
        `SERVICE-ERROR(Q-300): Data key 'foo' is not a valid key.\n` +
          `  - Data key can only contain characters (preferably lowercase) or number\n` +
          `  - Data key is prefixed with service name\n` +
          `  - Data key is made up from parts that are separated with ':'.`
      );
    });
  });

  describe('validateKeyPart', () => {
    it('should allow valid keys', () => {
      expect(validateKeyPart('')).to.eql('');
      expect(validateKeyPart('lowercase')).to.eql('lowercase');
      expect(validateKeyPart('with_under-dash')).to.eql('with_under-dash');
    });

    it('should throw on invalid characters', () => {
      expect(() => validateKeyPart(':')).to.throw(
        `SERVICE-ERROR(Q-303): ':' is not a valid attribute. Attributes can only contain 'a-z' (lowercase), '0-9', '-' and '_'.`
      );
      expect(() => validateKeyPart('with.dot')).to.throw(
        `SERVICE-ERROR(Q-303): 'with.dot' is not a valid attribute. Attributes can only contain 'a-z' (lowercase), '0-9', '-' and '_'.`
      );
      expect(() => validateKeyPart('mixCase')).to.throw(
        `SERVICE-ERROR(Q-303): 'mixCase' is not a valid attribute. Attributes can only contain 'a-z' (lowercase), '0-9', '-' and '_'.`
      );
    });
  });
});
