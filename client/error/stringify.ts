/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { isHtmlElement } from '../util/types.js';

export function stringifyDebug(value: any): string | null {
  if (value == null) return String(value);
  if (typeof value === 'function') return value.name;
  if (isHtmlElement(value)) return stringifyElement(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function stringifyElement(element: Element): string {
  let html = '<' + element.tagName.toLowerCase();
  const attributes = element.attributes;
  const names = [];
  for (let i = 0; i < attributes.length; i++) {
    names.push((attributes[i] as Attr).name);
  }
  names.sort();
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    let value = element.getAttribute(name);
    if (value?.startsWith('file:/')) {
      value = value.replace(
        /(file:\/\/).*(\/.*)$/,
        (all, protocol, file) => protocol + '...' + file
      );
    }
    html +=
      ' ' + name + (value == null || value == '' ? '' : "='" + value.replace("'", '&apos;') + "'");
  }
  return html + '>';
}
