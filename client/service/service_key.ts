/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { isValidAttribute } from '../error/data.js';
import { fromCamelToKebabCase, fromKebabToCamelCase } from '../util/case.js';
import type { Service, ServiceConstructor, ServiceStateOf } from './service.js';
import { qError, QError } from '../error/error.js';
import { stringify } from '../util/stringify.js';
import { assertString } from '../assert/assert.js';

/**
 * String representation of the service key.
 *
 * A service is uniquely identified by its props. Props is an object of key/value pairs which is
 * used to look up the service. When referring to service in DOM it is necessary to serialize the
 * Props into a unique strings which is a valid DOM attribute. To do that the Prop values are
 * concatenated into a `ServiceKey` like so `<service_name>:<value1>:<value2>:...`. The order
 * of values is determined by the `Service.$keyProps` property.
 *
 * When Service is working with the Props it is more connivent to use the deserialized version of
 * the `ServiceKey` which is Props.
 *
 * See: `Service.$keyProps`
 *
 * Example:
 *
 * ```
 * interface MyProps {
 *   id: string;
 * }
 *
 * class MyService extends Service<MyProps, {}> {
 *   $qrl = QRL`./path/to/service/MyService`;
 *   $type = 'myService';
 *   $keyProps = ['id'];
 * }
 *
 * expect(MyService.$propsToKey({id: 123})).toEqual('my-service:123');
 * expect(MyService.$keyToProps('my-service:123')).toEqual({id: 123});
 * ```
 *
 * @public
 */
export interface ServiceKey<SERVICE = Service<any, any>> {
  __brand__: SERVICE;
}

/**
 * Converts a `string` into `ServiceKey` typed object.
 *
 * `ServiceKey`s are `string`s at runtime. This function just adds type-safety.
 *
 * @param key - `string` representation of `ServiceKey`
 * @returns `ServiceKey`
 * @public
 */
export function toServiceKey<SERVICE extends Service<any, any>>(key: string): ServiceKey<SERVICE> {
  qDev && assertString(key);
  return key as any;
}

/**
 * Converts service `Props` into service key.
 *
 * Service keys are of format `service:value1:value2:...`. The order
 * of values is defined in `ServiceType.$keyProps` and the service key
 * prefix is defined in `ServiceType.$type`
 *
 * @param serviceType - `ServiceType` used to extract `ServiceType.$type` and
 *        `ServiceType.$keyProps` for the conversion process.
 * @param props - A `Props` object where key values need to be converted to
 *          service-key according to the `ServiceType.$keyProps`.
 * @returns service-key.
 * @internal
 */
export function propsToKey(
  serviceType: ServiceConstructor<any>,
  props: Record<string, any>
): ServiceKey<any> {
  let id = fromCamelToKebabCase(serviceType.$type) + ':';
  const propNames = serviceType.$keyProps;
  if (!propNames) {
    throw qError(QError.Service_no$keyProps_service, serviceType);
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
 * Converts service key into `Props`.
 *
 * Service keys are of format `service:value1:value2:...`
 *
 * @param serviceType - `ServiceType` used to extract `ServiceType.$type` and
 *        `ServiceType.$keyProps` for the conversion process
 * @param key - Service keys are of format `service:value1:value2:...`
 * @returns A `Props` object where key values have been convert to properties
 *          according to the `ServiceType.$keyProps`.
 * @internal
 */
export function keyToProps(
  serviceType: ServiceConstructor<any>,
  key: ServiceKey | string
): { [key: string]: string | number | null | undefined } {
  const props: any = {};
  const propOrder = serviceType.$keyProps;
  if (!propOrder) {
    throw qError(QError.Service_no$keyProps_service, serviceType);
  }
  propOrder.forEach((key) => (props[key] = null));
  const keyParts = String(key).split(':');
  if (keyParts.length <= 1) {
    throw qError(QError.Service_keyMissingParts_key_key, key, key);
  }
  const serviceName = keyParts.shift();
  const expectedName = fromCamelToKebabCase(serviceType.$type);
  if (expectedName !== serviceName) {
    throw qError(
      QError.Service_keyNameMismatch_key_name_service_name,
      key,
      serviceName,
      serviceType,
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
      throw qError(QError.Service_keyTooManyParts_service_parts_key, serviceType, propOrder, key);
    }
    const propName = propOrder[i];
    props[propName] =
      part == '' && i == keyParts.length - 1 ? null : fromKebabToCamelCase(part, false);
  }
  return props;
}

/**
 * Validates that a service key contains only valid characters.
 *
 * Service keys need to be serialized into DOM attributes. DOM
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
    throw qError(QError.Service_invalidAttribute_name, value);
  }
}

/**
 * Retrieve `ServiceKey` from Service State.
 *
 * Qoot stores `ServiceKey` in the state of the Service as `$key` even
 * if it is not declared in the State type. Use this method to retrieve it.
 *
 * This method is convenient when Service key is needed but only Service State is available.
 *
 * @param value - Service State
 * @returns `ServiceKey`
 * @public
 */
export function serviceStateKey<SERVICE extends Service<any, any>>(
  value: SERVICE | ServiceStateOf<SERVICE>
): ServiceKey<SERVICE> {
  const key = (value as any).$key;
  if (typeof key !== 'string') {
    throw qError(QError.Service_stateMissingKey_state, value);
  }
  return key as any;
}

/**
 * Returns the attribute where the service QRL is stored.
 *
 * @param key - service key attribute name (ie: `foo:123:456`)
 * @returns Service attribute (ie: `::foo`)
 */
export function keyToServiceAttribute(serviceKey: ServiceKey | string): string {
  const key: string = serviceKey as any;
  const idx = key.indexOf(':');
  if (idx == -1) {
    throw qError(QError.Service_notValidKey_key, key);
  }
  return '::' + key.substr(0, idx);
}
