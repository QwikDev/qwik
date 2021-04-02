/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */
import { fromCamelToKebabCase } from '../../util/case.js';
import { stringify } from '../../util/stringify.js';
import { assertValidDataKey } from '../../error/data.js';
import { AttributeMarker } from '../../util/markers.js';
import { ServiceConstructor } from '../../service/service.js';
import { QRL } from '../../import/qrl.js';
import { QError, qError } from '../../error/error.js';

export interface QProps {
  [key: string]: string | QRL;
}

/**
 * Apply Props to Element
 *
 * @param element -`Element` onto which attributes need to be applied.
 * @param props -`Props` to apply
 * @param detectChanges - if true, ready the previous attributes to see if any have changed.
 */
export function applyAttributes(
  element: Element,
  props: Record<string, string> | null,
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

/**
 * Keep track of `bind:*`  attributes so that they can be correctly update.
 *
 * The tricky part is that the key/value are reversed in the `bind:*` attributes so that
 * we can `querySelectAll` on the attribute.
 *
 * This means that we need to add/remove/join attributes if more than one binding changes.
 */
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

/**
 * Apply the `bind:*` updates to the DOM.
 */
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

/**
 * Set attribute on a DOM element.
 *
 * This function understand `class`, `style` as well as `input` attributes.
 * @internal
 */
export function setAttribute(element: Element, key: string, value: any) {
  if (key == 'class') {
    element.setAttribute('class', stringifyClassOrStyle(value, true));
  } else if (key == 'style') {
    element.setAttribute('style', stringifyClassOrStyle(value, false));
  } else if (value == null) {
    element.removeAttribute(key);
  } else if (element.tagName === 'INPUT' && key.indexOf(':') == -1) {
    (element as any)[key] = value;
  } else {
    element.setAttribute(key, String(value));
  }
}

/**
 * Set control properties (`$`) on the DOM element.
 *
 * Control properties include `on:*` as well as services.
 */
export function applyControlProperties(element: Element, props: { [key: string]: any }) {
  for (const key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key)) {
      const value = props[key];
      if (value == null) {
        element.removeAttribute(key);
      } else if (key === 'services') {
        if (Array.isArray(value)) {
          const services = value as ServiceConstructor<any>[];
          services.forEach((service) => {
            if (typeof service?.$attachService === 'function') {
              service.$attachService(element);
            } else {
              throw qError(QError.Render_expectingService_service, service);
            }
          });
        } else {
          throw qError(QError.Render_expectingServiceArray_obj, value);
        }
      } else {
        element.setAttribute(key, String(value));
      }
    }
  }
}

/**
 * Turn an `Array` or object literal into a `class` or `style`
 *
 * @param obj `string`, `Array` or object literal
 * @param isClass `true` if expecting `class` output
 * @returns `string`
 */
export function stringifyClassOrStyle(obj: any, isClass: boolean): string {
  if (obj == null) return '';
  if (typeof obj == 'object') {
    let text = '';
    let sep = '';
    if (Array.isArray(obj)) {
      if (!isClass) {
        throw qError(QError.Render_unsupportedFormat_obj_attr, obj, 'style');
      }
      for (let i = 0; i < obj.length; i++) {
        text += sep + obj[i];
        sep = ' ';
      }
    } else {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          text += isClass ? (value ? sep + key : '') : sep + key + ':' + value;
          sep = isClass ? ' ' : ';';
        }
      }
    }
    return text;
  }
  return String(obj);
}
