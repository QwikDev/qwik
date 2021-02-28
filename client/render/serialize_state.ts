/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { isPromise } from '../util/promises.js';
import { Component } from '../component/types.js';
import { ElementExpando } from '../component/types.js';

export function serializeState(document: Document) {
  document.querySelectorAll('[\\:\\:]').forEach((hostElement) => {
    const component = (hostElement as ElementExpando<Component<any, any>>).$QOOT_COMPONENT;
    if (component && !isPromise(component)) {
      const state = component.$state;
      hostElement.setAttribute(':.', JSON.stringify(state));
    }
  });
}
