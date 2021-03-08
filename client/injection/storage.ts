/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { qError, QError } from '../error/error.js';
import { assertDefined } from '../assert/assert.js';
import { ServiceInjector } from '../injection/element_injector.js';

export function getStorage(element: Element): QootStorage;
export function getStorage(element: Element, create: false): QootStorage | undefined;
export function getStorage(element: Element, create: boolean = true): QootStorage | undefined {
  qDev && assertDefined(element, 'Expecting Element');
  const _element = element as ElementExpando;
  let $QOOT = _element.$QOOT;
  if (create && !$QOOT) {
    _element.$QOOT = $QOOT = new Map();
    element.setAttribute(':', ''); // We need to mark the Storage so that serializeState knows where to look for State
  }
  return $QOOT;
}

export type QootStorage = Map<string, ServiceInjector>;

export interface ElementExpando extends Element {
  $QOOT?: QootStorage;
}

export function storeInjector(
  element: Element,
  key: string,
  injector: ServiceInjector
): ServiceInjector {
  const storage = getStorage(element);
  if (storage.has(key)) {
    throw qError(QError.Service_keyAlreadyExists_key, key);
  }
  qDev && assertDefined(injector);
  storage.set(key, injector);
  return injector;
}

export function retrieveInjector(element: Element, key: string): ServiceInjector | undefined {
  const storage = getStorage(element);
  if (!storage) return undefined;
  return storage.get(key);
}
