/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { qError, QError } from '../error/error.js';
import { qImport } from '../import/qImport.js';
import { findAttribute } from '../util/dom_attrs.js';
import { Service } from './service.js';
import { keyToServiceAttribute } from './service_key.js';
import { Key } from './types.js';

/**
 * Retrieve the service by service key.
 *
 * See `Service.$hydrate` for related behavior.
 * `Service.$hydrate` requires that you lazy load the service. This method
 * does not need the `ServiceType`, instead it looks for the service definition
 * loads the `ServiceType` and delegates to `Service.$hydrate` to retrieve the service
 * when the key is the only thing which is known.
 *
 * @param element Location where the search should start.
 * @param key Key of service to retrieve.
 * @returns
 */
export async function retrieveService<SERVICE extends Service<any, any>>(
  element: Element,
  key: Key
): Promise<SERVICE> {
  return findAttribute(element, key, null, async (element, attrName, attrValue) => {
    const serviceAttrName = keyToServiceAttribute(key);
    const qrl = element.getAttribute(serviceAttrName);
    if (!qrl) {
      throw qError(QError.Service_elementMissingServiceAttr_element_attr, element, serviceAttrName);
    }
    const serviceType: typeof Service = await qImport(element, qrl);
    return (serviceType.$hydrate(element, attrName) as unknown) as Promise<SERVICE>;
  });
}
