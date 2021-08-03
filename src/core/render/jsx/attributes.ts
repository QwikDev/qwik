/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
import { fromCamelToKebabCase } from '../../util/case';
import { stringify } from '../../util/stringify';
import { assertValidDataKey } from '../../error/data';
import { AttributeMarker } from '../../util/markers';
import type { EntityConstructor } from '../../entity/entity';
import { QError, qError } from '../../error/error';
import type { QwikDOMAttributes } from './types';

/**
 * Apply Props to Element
 *
 * @param element -`Element` onto which attributes need to be applied.
 * @param props -`Props` to apply
 * @param detectChanges - if true, ready the previous attributes to see if any have changed.
 */
export function applyAttributes(
  element: Element,
  props: Record<string, string> | QwikDOMAttributes | null,
  detectChanges: boolean
): boolean {
  let changesDetected = false;
  let isFirstEventListener = true;
  if (props) {
    let bindMap: Map<string, string> | null = null;
    for (const key in props) {
      if (key !== 'children' && Object.prototype.hasOwnProperty.call(props, key)) {
        const kebabKey = fromCamelToKebabCase(key);
        const value = (props as any)[key];
        if (key === AttributeMarker.Entity) {
          applyEntityProviders(value, element);
        } else if (key === AttributeMarker.ComponentTemplate) {
          setAttribute(element, AttributeMarker.ComponentTemplate, value);
        } else if (key.startsWith(AttributeMarker.EventPrefix)) {
          if (isFirstEventListener) {
            isFirstEventListener = false;
            setAttribute(element, AttributeMarker.EventAny, '');
          }
          setAttribute(element, kebabKey, value);
        } else {
          if (key.startsWith('$')) {
            addToBindMap(stringify(value), bindMap || (bindMap = new Map<string, string>()), key);
          } else if (detectChanges) {
            if (element.getAttribute(kebabKey) !== value) {
              setAttribute(element, key, value, kebabKey);
              changesDetected = true;
            }
          } else {
            setAttribute(element, key, value, kebabKey);
          }
        }
      }
    }
    if (bindMap) {
      changesDetected = updateBindMap(element, bindMap) || changesDetected;
    }
  }
  return changesDetected;
}

function applyEntityProviders(value: any, element: Element) {
  if (Array.isArray(value)) {
    value.forEach((entity: EntityConstructor) => {
      if (typeof entity?.$attachEntity === 'function') {
        entity.$attachEntity(element);
      } else {
        throw qError(QError.Render_expectingEntity_entity, entity);
      }
    });
  } else {
    throw qError(QError.Render_expectingEntityArray_obj, value);
  }
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
  assertValidDataKey(stringValue);
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
 *
 * @returns `true` if changes were detected.
 */
function updateBindMap(element: Element, bindMap: Map<string, string>): boolean {
  let changesDetected = false;
  for (let i = 0, attrs = element.attributes; i < attrs.length; i++) {
    const attr = attrs[i];
    const key = attr.name;
    if (key.startsWith(AttributeMarker.BindPrefix)) {
      const expectedValue = bindMap.get(key);
      if (expectedValue != null) {
        bindMap.delete(key);
        if (attr.value === expectedValue) {
          // if expected is same as actual we can remove it from map
          bindMap.delete(key);
        } else {
          changesDetected = true;
          attr.value = expectedValue;
        }
      } else {
        changesDetected = true;
        element.removeAttribute(key);
        i--;
      }
    }
  }
  bindMap.forEach((v, k) => {
    changesDetected = true;
    element.setAttribute(k, v);
  });
  return changesDetected;
}

/**
 * Set attribute on a DOM element.
 *
 * This function understand `class`, `style` as well as `input` attributes.
 * @internal
 */
export function setAttribute(element: Element, key: string, value: any, kebabKey?: string) {
  if (key == 'class') {
    element.setAttribute('class', stringifyClassOrStyle(value, true));
  } else if (key == 'style') {
    element.setAttribute('style', stringifyClassOrStyle(value, false));
  } else if (value == null || value === false) {
    element.removeAttribute(key);
  } else if (key === 'innerHTML' || key === 'innerText') {
    element.setAttribute(kebabKey!, '');
    (element as any)[key] = value;
  } else {
    element.setAttribute(key, String(value));
  }
  if ((key == 'value' || key == 'checked') && element.tagName === 'INPUT') {
    // INPUT properties `value` and `checked` are special because they can go out of sync
    // between the attribute and what the user entered, so they have special treatment.
    (element as any)[key] = value;
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
