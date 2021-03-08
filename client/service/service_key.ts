/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { isValidAttribute } from '../error/data.js';
import { fromCamelToKebabCase, fromKebabToCamelCase } from '../util/case.js';
import { ServiceType } from './types.js';
import { qError, QError } from '../error/error.js';
import { stringify } from '../util/stringify.js';

/**
 * Converts service `Props` into service key.
 *
 * Service keys are of format `service:value1:value2:...`. The order
 * of values is defined in `ServiceType.$keyProps` and the service key
 * prefix is defined in `ServiceType.$name`
 *
 * @param serviceType `ServiceType` used to extract `ServiceType.$name` and
 *        `ServiceType.$keyProps` for the conversion process.
 * @param props  A `Props` object where key values need to be converted to
 *          service-key according to the `ServiceType.$keyProps`.
 * @returns service-key.
 */
export function propsToKey(serviceType: ServiceType<any>, props: {}) {
  let id = fromCamelToKebabCase(serviceType.$name) + ':';
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
  return id;
}

/**
 * Converts service key into `Props`.
 *
 * Service keys are of format `service:value1:value2:...`
 *
 * @param serviceType `ServiceType` used to extract `ServiceType.$name` and
 *        `ServiceType.$keyProps` for the conversion process
 * @param key Service keys are of format `service:value1:value2:...`
 * @returns A `Props` object where key values have been convert to properties
 *          according to the `ServiceType.$keyProps`.
 */
export function keyToProps(
  serviceType: ServiceType<any>,
  key: string
): { [key: string]: string | number | null | undefined } {
  const props: any = {};
  const propOrder = serviceType.$keyProps;
  if (!propOrder) {
    throw qError(QError.Service_no$keyProps_service, serviceType);
  }
  propOrder.forEach((key) => (props[key] = null));
  const keyParts = key.split(':');
  if (keyParts.length <= 1) {
    throw qError(QError.Service_keyMissingParts_key_key, key, key);
  }
  const serviceName = keyParts.shift();
  const expectedName = fromCamelToKebabCase(serviceType.$name);
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
 * Returns the attribute where the service QRL is stored.
 *
 * @param key service key attribute name (ie: `foo:123:456`)
 * @returns Service attribute (ie: `::foo`)
 */
export function keyToServiceAttribute(key: string): string {
  const idx = key.indexOf(':');
  if (idx == -1) {
    throw qError(QError.Service_notValidKey_key, key);
  }
  return '::' + key.substr(0, idx);
}

/**
 * Validates that a service key contains only valid characters.
 *
 * Service keys need to be serialized into DOM attributes. DOM
 * puts constraints on what characters are allowed in attributes.
 * This function verifies that the key is valid.
 *
 * @param value Key part
 * @returns Returns `value` or throws an error.
 */
export function validateKeyPart(value: any): string {
  const text = value == null ? '' : String(value);
  if (isValidAttribute(text)) {
    return text;
  } else {
    throw qError(QError.Service_invalidAttribute_name, value);
  }
}
