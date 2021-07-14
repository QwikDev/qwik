/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { isValidAttribute } from '../error/data';
import { fromCamelToKebabCase, fromKebabToCamelCase } from '../util/case';
import type { Entity, EntityConstructor, EntityStateOf } from './entity';
import { qError, QError } from '../error/error';
import { stringify } from '../util/stringify';
import { assertString } from '../assert/assert';

/**
 * String representation of the entity key.
 *
 * A entity is uniquely identified by its props. Props is an object of key/value pairs which is
 * used to look up the entity. When referring to entity in DOM it is necessary to serialize the
 * Props into a unique strings which is a valid DOM attribute. To do that the Prop values are
 * concatenated into a `EntityKey` like so `<entity_name>:<value1>:<value2>:...`. The order
 * of values is determined by the `Entity.$keyProps` property.
 *
 * When Entity is working with the Props it is more connivent to use the deserialized version of
 * the `EntityKey` which is Props.
 *
 * See: `Entity.$keyProps`
 *
 * Example:
 *
 * ```
 * interface MyProps {
 *   id: string;
 * }
 *
 * class MyEntity extends Entity<MyProps, {}> {
 *   $qrl = QRL`./path/to/entity/MyEntity`;
 *   $type = 'myEntity';
 *   $keyProps = ['id'];
 * }
 *
 * expect(MyEntity.$propsToKey({id: 123})).toEqual('my-entity:123');
 * expect(MyEntity.$keyToProps('my-entity:123')).toEqual({id: 123});
 * ```
 *
 * @public
 */
export interface EntityKey<SERVICE = Entity<any, any>> {
  __brand__: SERVICE;
}

/**
 * Converts a `string` into `EntityKey` typed object.
 *
 * `EntityKey`s are `string`s at runtime. This function just adds type-safety.
 *
 * @param key - `string` representation of `EntityKey`
 * @returns `EntityKey`
 * @public
 */
export function toEntityKey<SERVICE extends Entity<any, any>>(key: string): EntityKey<SERVICE> {
  assertString(key);
  return key as any;
}

/**
 * Converts entity `Props` into entity key.
 *
 * Entity keys are of format `entity:value1:value2:...`. The order
 * of values is defined in `EntityType.$keyProps` and the entity key
 * prefix is defined in `EntityType.$type`
 *
 * @param entityType - `EntityType` used to extract `EntityType.$type` and
 *        `EntityType.$keyProps` for the conversion process.
 * @param props - A `Props` object where key values need to be converted to
 *          entity-key according to the `EntityType.$keyProps`.
 * @returns entity-key.
 * @internal
 */
export function propsToKey(
  entityType: EntityConstructor<any>,
  props: Record<string, any>
): EntityKey<any> {
  let id = fromCamelToKebabCase(entityType.$type) + ':';
  const propNames = entityType.$keyProps;
  if (!propNames) {
    throw qError(QError.Entity_no$keyProps_entity, entityType);
  }
  for (let i = 0; i < propNames.length; i++) {
    const name = propNames[i];
    if (i != 0) {
      id += ':';
    }
    const value = fromCamelToKebabCase(stringify((props as any)[name]), true);
    id += validateKeyPart(value);
  }
  return id as any;
}

/**
 * Converts entity key into `Props`.
 *
 * Entity keys are of format `entity:value1:value2:...`
 *
 * @param entityType - `EntityType` used to extract `EntityType.$type` and
 *        `EntityType.$keyProps` for the conversion process
 * @param key - Entity keys are of format `entity:value1:value2:...`
 * @returns A `Props` object where key values have been convert to properties
 *          according to the `EntityType.$keyProps`.
 * @internal
 */
export function keyToProps(
  entityType: EntityConstructor<any>,
  key: EntityKey | string
): { [key: string]: string | number | null | undefined } {
  const props: any = {};
  const propOrder = entityType.$keyProps;
  if (!propOrder) {
    throw qError(QError.Entity_no$keyProps_entity, entityType);
  }
  propOrder.forEach((key) => (props[key] = null));
  const keyParts = String(key).split(':');
  if (keyParts.length <= 1) {
    throw qError(QError.Entity_keyMissingParts_key_key, key, key);
  }
  const entityName = keyParts.shift();
  const expectedName = fromCamelToKebabCase(entityType.$type);
  if (expectedName !== entityName) {
    throw qError(
      QError.Entity_keyNameMismatch_key_name_entity_name,
      key,
      entityName,
      entityType,
      expectedName
    );
  }
  if (propOrder.length == 0 && keyParts.length == 1 && keyParts[0] == '') {
    // special case for keys with no parts.
    return props;
  }
  for (let i = 0; i < keyParts.length; i++) {
    const part = keyParts[i];
    if (i >= propOrder.length) {
      throw qError(QError.Entity_keyTooManyParts_entity_parts_key, entityType, propOrder, key);
    }
    const propName = propOrder[i];
    props[propName] =
      part == '' && i == keyParts.length - 1 ? null : fromKebabToCamelCase(part, false);
  }
  return props;
}

/**
 * Validates that a entity key contains only valid characters.
 *
 * Entity keys need to be serialized into DOM attributes. DOM
 * puts constraints on what characters are allowed in attributes.
 * This function verifies that the key is valid.
 *
 * @param value - Key part
 * @returns Returns `value` or throws an error.
 * @internal
 */
export function validateKeyPart(value: any): string {
  const text = value == null ? '' : String(value);
  if (isValidAttribute(text)) {
    return text;
  } else {
    throw qError(QError.Entity_invalidAttribute_name, value);
  }
}

/**
 * Retrieve `EntityKey` from Entity State.
 *
 * Qwik stores `EntityKey` in the state of the Entity as `$key` even
 * if it is not declared in the State type. Use this method to retrieve it.
 *
 * This method is convenient when Entity key is needed but only Entity State is available.
 *
 * @param value - Entity State
 * @returns `EntityKey`
 * @public
 */
export function entityStateKey<SERVICE extends Entity<any, any>>(
  value: SERVICE | EntityStateOf<SERVICE>
): EntityKey<SERVICE> {
  const key = (value as any).$key;
  if (typeof key !== 'string') {
    throw qError(QError.Entity_stateMissingKey_state, value);
  }
  return key as any;
}

/**
 * Returns the attribute where the entity QRL is stored.
 *
 * @param key - entity key attribute name (ie: `foo:123:456`)
 * @returns Entity attribute (ie: `::foo`)
 */
export function keyToEntityAttribute(entityKey: EntityKey | string): string {
  const key: string = entityKey as any;
  const idx = key.indexOf(':');
  if (idx == -1) {
    throw qError(QError.Entity_notValidKey_key, key);
  }
  return '::' + key.substr(0, idx);
}
