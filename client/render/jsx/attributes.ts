/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { JSXProps, QProps } from './factory.js';

/**
 * Apply JSXProps to Element
 */
export function applyAttributes(
  document: Document,
  element: Element,
  props: JSXProps | null
) {
  if (props) {
    for (const key in props) {
      if (Object.prototype.hasOwnProperty.call(props, key)) {
        const value = props[key];
        if (key === '$' && value) {
          applyControlProperties(
            document,
            element,
            (value as unknown) as QProps
          );
        } else {
          element.setAttribute(key, value);
        }
      }
    }
  }
}

function applyControlProperties(
  document: Document,
  element: Element,
  props: { [key: string]: string }
) {
  for (const key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      const value = props[key];
      element.setAttribute(key, value);
    }
  }
}
