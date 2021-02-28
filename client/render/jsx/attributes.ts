/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */
import { Props, QProps } from '../../component/types.js';

/**
 * Apply Props to Element
 *
 * @param element `Element` onto which attributes need to be applied.
 * @param props `Props` to apply
 * @param detectChanges if true, ready the previous attributes to see if any have changed.
 */
export function applyAttributes(
  element: Element,
  props: Props | null,
  detectChanges: boolean
): boolean {
  let changesDetected = false;
  if (props) {
    for (const key in props) {
      if (Object.prototype.hasOwnProperty.call(props, key)) {
        const value = props[key];
        if (key === '$' && value) {
          // TODO[type]: Suspicious casting.
          applyControlProperties(element, (value as unknown) as QProps);
        } else if (detectChanges) {
          const stringValue = stringify(value);
          if (element.getAttribute(key) !== stringValue) {
            setAttribute(element, key, stringValue);
            changesDetected = true;
          }
        } else {
          setAttribute(element, key, stringify(value));
        }
      }
    }
  }
  return changesDetected;
}

function stringify(value: any): string | null {
  return value == null ? null : String(value);
}

function setAttribute(element: Element, key: string, value: string | null) {
  if (value == null) {
    element.removeAttribute(key);
  } else {
    element.setAttribute(key, value);
  }
}

function applyControlProperties(element: Element, props: { [key: string]: any }) {
  for (const key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      const value = props[key];
      if (value == null) {
        element.removeAttribute(key);
      } else {
        element.setAttribute(key, String(value));
      }
    }
  }
}
