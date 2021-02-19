/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import {JSXProps} from './factory.js';

/**
 * Apply JSXProps to Element
 */
export function applyAttributes(props: JSXProps|null, element: Element) {
  if (props) {
    for (const key in props) {
      if (Object.prototype.hasOwnProperty.call(props, key)) {
        const value = props[key];
        element.setAttribute(key, value);
      }
    }
  }
}
