/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { qError, QError } from '../error/error.js';

/**
 * Read attributes from `Element` and return them as an object literal.
 *
 * NOTE: This function ignores all special attributes such as `::`.
 *
 * @param element Element to read attributes from.
 */
export function readElementAttributes(element: Element): { [attribute: string]: string } {
  const props: { [attribute: string]: string } = {};
  const attrs = element.attributes;
  // todo: extract to utility function
  for (let i = 0, ii = attrs.length; i < ii; i++) {
    const attr = attrs[i];
    const name = attr.name;
    if (name.indexOf(':') == -1 && name.indexOf('.') == -1) {
      // ignore all special attributes.
      (props as { [key: string]: string })[name] = attr.value;
    }
  }
  return props;
}

// TODO: test
// TODO: docs
export function findAttribute<RET1, RET2>(
  element: Element,
  attributePrimary: string,
  attributeSecondary: null,
  callbackPrimary: (element: Element, attrName: string, attrValue: string) => RET1
): RET1 | RET2;
export function findAttribute<RET1, RET2>(
  element: Element,
  attributePrimary: string,
  attributeSecondary: string,
  callbackPrimary: (element: Element, attrName: string, attrValue: string) => RET1,
  callbackSecondary: (element: Element, attrName: string, attrValue: string) => RET2
): RET1 | RET2;
export function findAttribute<RET1, RET2>(
  element: Element,
  attributePrimary: string,
  attributeSecondary: string | null,
  callbackPrimary: (element: Element, attrName: string, attrValue: string) => RET1,
  callbackSecondary?: (element: Element, attrName: string, attrValue: string) => RET2
): RET1 | RET2 {
  let cursor: Element | null = element;
  while (cursor) {
    const attrValuePrimary = cursor.getAttribute(attributePrimary);
    if (attrValuePrimary !== null) {
      return callbackPrimary(cursor, attributePrimary, attrValuePrimary);
    }
    if (attributeSecondary && callbackSecondary) {
      const attrValueSecondary = cursor.getAttribute(attributeSecondary);
      if (attrValueSecondary !== null) {
        return callbackSecondary(cursor, attributePrimary, attrValueSecondary);
      }
    }
    cursor = cursor.parentElement;
  }
  throw qError(
    QError.Core_noAttribute_atr1_attr2_element,
    attributePrimary,
    attributeSecondary,
    element
  );
}
