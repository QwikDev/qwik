/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { expect } from 'chai';
import type { EntityConstructor } from './entity.js';
import {
  entityStateKey,
  keyToEntityAttribute,
  keyToProps,
  propsToKey,
  validateKeyPart,
} from './entity_key.js';

describe('entity key', () => {
  const MissingKeyPropsEntity: EntityConstructor<any> = class MissingKeyPropsEntity {
    static $type = 'missingEntity';
  } as any;
  const MockEntity: EntityConstructor<any> = class MockEntity {
    static $keyProps = ['a', 'propB', 'c'];
    static $type = 'myEntity';
  } as any;
  const EmptyEntity: EntityConstructor<any> = class EmptyEntity {
    static $keyProps = [];
    static $type = 'emptyEntity';
  } as any;
  describe('propsToKey', () => {
    it('should convert prop to key', () => {
      expect(propsToKey(MockEntity, {})).to.eql('my-entity:::');
      expect(propsToKey(MockEntity, { a: 12 })).to.eql('my-entity:12::');
      expect(propsToKey(MockEntity, { a: 12, propB: 3, c: 4 })).to.eql('my-entity:12:3:4');
      expect(propsToKey(MockEntity, { a: null, propB: undefined, c: 4 })).to.eql('my-entity:::4');
      expect(propsToKey(MockEntity, { a: 'A', propB: 'aA' })).to.eql('my-entity:-a:a-a:');
    });

    it('should error', () => {
      expect(() => propsToKey(MissingKeyPropsEntity, {})).to.throw(
        `SERVICE-ERROR(Q-311): Entity 'MissingKeyPropsEntity' does not define '$keyProps'.`
      );
      expect(() => propsToKey(MockEntity, { a: '.' })).to.throw(
        `SERVICE-ERROR(Q-303): '.' is not a valid attribute. Attributes can only contain 'a-z' (lowercase), '0-9', '-' and '_'.`
      );
    });
  });

  describe('keyToProps', () => {
    it('should convert key', () => {
      expect(keyToProps(MockEntity, `my-entity:1:234:56`)).to.eql({
        a: '1',
        propB: '234',
        c: '56',
      });
      expect(keyToProps(MockEntity, `my-entity:1:234`)).to.eql({ a: '1', propB: '234', c: null });
      expect(keyToProps(MockEntity, `my-entity:-a:a-a:-a-a`)).to.eql({
        a: 'A',
        propB: 'aA',
        c: 'AA',
      });
      expect(keyToProps(MockEntity, `my-entity:1`)).to.eql({ a: '1', propB: null, c: null });
      expect(keyToProps(MockEntity, `my-entity:`)).to.eql({ a: null, propB: null, c: null });
      expect(keyToProps(MockEntity, `my-entity::`)).to.eql({ a: '', propB: null, c: null });
      expect(keyToProps(EmptyEntity, `empty-entity:`)).to.eql({});
    });
    it('should error', () => {
      expect(() => keyToProps(MissingKeyPropsEntity, `my-entity::`)).to.throw(
        `SERVICE-ERROR(Q-311): Entity 'MissingKeyPropsEntity' does not define '$keyProps'.`
      );
      expect(() => keyToProps(MockEntity, `my-entity`)).to.throw(
        `SERVICE-ERROR(Q-309): Entity key 'my-entity' is missing values. Expecting 'my-entity:someValue'.`
      );
      expect(() => keyToProps(MockEntity, `other-entity:`)).to.throw(
        `SERVICE-ERROR(Q-315): Key 'other-entity:' belongs to entity named 'other-entity', but expected entity 'MockEntity' with name 'my-entity'.`
      );
      expect(() => keyToProps(MockEntity, `my-entity::::`)).to.throw(
        `SERVICE-ERROR(Q-314): Entity 'MockEntity' defines '$keyProps' as  '["a","propB","c"]'. Actual key 'my-entity::::' has more parts than entity defines.`
      );
    });
  });

  describe('keyToEntityName', () => {
    it('should extract entity name', () => {
      expect(keyToEntityAttribute('foo:')).to.eql('::foo');
      expect(keyToEntityAttribute('bar:baz')).to.eql('::bar');
      expect(keyToEntityAttribute('bar:baz:qwik')).to.eql('::bar');
      expect(keyToEntityAttribute(':')).to.eql('::');
    });
    it('should complain on bad format', () => {
      expect(() => keyToEntityAttribute('foo')).to.throw(
        `SERVICE-ERROR(Q-300): Data key 'foo' is not a valid key.\n` +
          `  - Data key can only contain characters (preferably lowercase) or number\n` +
          `  - Data key is prefixed with entity name\n` +
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

  describe('entityStateKey', () => {
    it('should retrieve key', () => {
      expect(entityStateKey({ $key: 'theKey' })).to.equal('theKey');
    });
    describe('error', () => {
      it('should throw error if not a key is passed in', () => {
        expect(() => entityStateKey({ something: 1 })).to.throw(
          `SERVICE-ERROR(Q-316): Entity state is missing '$key'. Are you sure you passed in state? Got '{"something":1}'.`
        );
      });
    });
  });
});
