/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { qError, QError } from '../error/error.js';
import { qImport } from '../import/qImport.js';
import { getStorage } from '../injection/storage.js';
import { findAttribute } from '../util/dom_attrs.js';
import { Service } from './service.js';
import { keyToProps, keyToServiceAttribute } from './service_key.js';
import { PropsOf, Key, StateOf } from './types.js';

/**
 * Retrieves the State (if possible without re-hydrating the service.)
 *
 * Unlike `Service.$hydrate` which always causes service to be re-hydrated,
 * this method tries to retrieve the service state without re-hydrating the
 * service. If service state can't be found but a service provide definition
 * is found, the method will cause `Service.$hydrate` to be invoked
 *
 * @param element Element to start the search for.
 * @param key Key to service to retrieve
 * @returns Returns the service state or throws.
 */
export async function retrieveState<SERVICE extends Service<any, any>>(
  element: Element,
  key: Key
): Promise<StateOf<SERVICE>> {
  // TODO: assert ID is valid format.
  return findAttribute(
    element,
    key,
    keyToServiceAttribute(key),
    (element, attrName, stateJSON) => {
      const storage = getStorage(element);
      const service = storage?.get(key)?.instance;
      if (service) {
        return service.$state;
      }
      if (stateJSON) {
        return JSON.parse(stateJSON) as StateOf<SERVICE>;
      }
      throw qError(QError.Service_missingExpandoOrState_attrName, attrName);
    },
    async (element, attrName, serviceQRL) => {
      const serviceType = (await qImport(element, serviceQRL)) as typeof Service;
      if (typeof serviceType !== 'function') {
        throw qError(QError.QRL_expectFunction_url_actual, serviceQRL, serviceType);
      }
      if (serviceType.$attachServiceState !== Service.$attachServiceState) {
        throw qError(QError.Service_overridesConstructor_service, serviceType);
      }
      const service: Service<any, any> = await serviceType.$hydrate(
        element,
        keyToProps(serviceType, key) as PropsOf<SERVICE>
      );
      return service.$state;
    }
  );
}
