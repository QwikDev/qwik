/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */
import { QProps } from '../../component/types.js';
import { fromCamelToKebabCase } from '../../util/case.js';
import { stringify } from '../../util/stringify.js';
import { ServiceType } from '../../service/types.js';
import { assertValidDataKey } from '../../error/data.js';
import { Props } from '../../injection/types.js';
import { AttributeMarker } from '../../util/markers.js';

/**
 * Apply Props to Element
 *
 * @param element -`Element` onto which attributes need to be applied.
 * @param props -`Props` to apply
 * @param detectChanges - if true, ready the previous attributes to see if any have changed.
 */
export function applyAttributes(
  element: Element,
  props: Props | null,
  detectChanges: boolean
): boolean {
  let changesDetected = false;
  if (props) {
    let bindMap: Map<string, string> | null = null;
    for (const key in props) {
      if (Object.prototype.hasOwnProperty.call(props, key)) {
        const kebabKey = fromCamelToKebabCase(key);
        const value = props[key];
        if (key === '$' && value) {
          // TODO[type]: Suspicious casting.
          applyControlProperties(element, (value as unknown) as QProps);
        } else {
          if (key.startsWith('$')) {
            addToBindMap(stringify(value), bindMap || (bindMap = new Map<string, string>()), key);
          } else if (detectChanges) {
            if (element.getAttribute(kebabKey) !== value) {
              setAttribute(element, kebabKey, value);
              changesDetected = true;
            }
          } else {
            setAttribute(element, kebabKey, value);
          }
        }
      }
    }
    if (bindMap) {
      updateBindMap(element, bindMap);
    }
  }
  return changesDetected;
}

function addToBindMap(stringValue: string | null, bindMap: Map<string, string>, key: string) {
  qDev && assertValidDataKey(stringValue);
  const bindKey =
    AttributeMarker.BindPrefix + (stringValue ? fromCamelToKebabCase(stringValue) : '');
  let existingKeys = bindMap.get(bindKey);
  if (existingKeys) {
    existingKeys += '|' + key;
  } else {
    existingKeys = key;
  }
  bindMap.set(bindKey, existingKeys);
}

function updateBindMap(element: Element, bindMap: Map<string, string>) {
  for (let i = 0, attrs = element.attributes; i < attrs.length; i++) {
    const attr = attrs[i];
    const key = attr.name;
    if (key.startsWith(AttributeMarker.BindPrefix)) {
      const expectedValue = bindMap.get(key);
      if (expectedValue != null) {
        bindMap.delete(key);
        if (attr.value !== expectedValue) {
          attr.value = expectedValue;
        }
      } else {
        element.removeAttribute(key);
        i--;
      }
    }
  }
  bindMap.forEach((v, k) => element.setAttribute(k, v));
}

// TODO: tests
// TODO: docs
function setAttribute(element: Element, key: string, value: any) {
  if (key == 'class') {
    element.setAttribute('class', stringifyClassOrStyle(value, true));
  } else if (key == 'style') {
    element.setAttribute('style', stringifyClassOrStyle(value, false));
  } else if (element.tagName === 'INPUT' && key.indexOf(':') == -1) {
    (element as any)[key] = value;
  } else if (value == null) {
    element.removeAttribute(key);
  } else {
    element.setAttribute(key, String(value));
  }
}

// TODO: tests
// TODO: docs
function applyControlProperties(element: Element, props: { [key: string]: any }) {
  for (const key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      const value = props[key];
      if (value == null) {
        element.removeAttribute(key);
      } else if (key === 'services') {
        // TODO: validation
        const services = value as ServiceType<any>[];
        services.forEach((service) => {
          service.$attachService(element);
        });
      } else {
        element.setAttribute(key, String(value));
      }
    }
  }
}

// TODO: tests
// TODO: docs
function stringifyClassOrStyle(obj: any, isClass: boolean): string {
  if (obj == null) return '';
  if (typeof obj == 'object') {
    let text = '';
    let sep = '';
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        text += isClass ? (value ? sep + key : '') : sep + key + ':' + value;
        sep = isClass ? ' ' : ';';
      }
    }
    return text;
  }
  return String(obj);
}
