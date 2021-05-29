/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { qError, QError } from '../error/error.js';
import '../util/qDev.js';
import { fromKebabToCamelCase } from './case.js';
import { AttributeMarker } from './markers.js';

/**
 * Returns the props from a given element.
 *
 * The method reads attributes on an element and returns `Props` object.
 *
 * @param element `Element` to read attributes from.
 * @internal
 */
export function extractPropsFromElement(element: Element): { [key: string]: string } {
  const props: { [key: string]: string } = {};
  const attrs = element.attributes;
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i] as Attr;
    const attrName = attr.name;
    const attrValue = attr.value;
    if (attrName.startsWith(AttributeMarker.BindPrefix)) {
      const id = attrName.substr(AttributeMarker.BindPrefixLength);
      if (!id) {
        throw qError(QError.Component_bindNeedsKey);
      }
      if (!attrValue) {
        throw qError(QError.Component_bindNeedsValue);
      }
      attrValue.split(';').forEach((key) => key && (props[key] = id));
    } else if (attrName.indexOf(':') !== -1) {
      // special attributes should be ignored
    } else {
      props[fromKebabToCamelCase(attrName, false)] = attrValue;
    }
  }
  return props;
}
