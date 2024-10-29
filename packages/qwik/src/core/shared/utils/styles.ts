import type { ClassList } from '../jsx/types/jsx-qwik-attributes';
import { QError, qError } from '../error/error';
import { isPreventDefault } from './event-names';
import { isClassAttr } from './scoped-styles';
import { isArray, isString } from './types';
import { isUnitlessNumber } from './unitless_number';
import { assertQrl } from '../qrl/qrl-utils';
import type { QRL } from '../qrl/qrl.public';
import { hashCode } from './hash_code';

export const serializeClass = (obj: ClassList): string => {
  if (!obj) {
    return '';
  }
  if (isString(obj)) {
    return obj.trim();
  }

  const classes: string[] = [];

  if (isArray(obj)) {
    for (const o of obj) {
      const classList = serializeClass(o);
      if (classList) {
        classes.push(classList);
      }
    }
  } else {
    for (const [key, value] of Object.entries(obj)) {
      if (value) {
        classes.push(key.trim());
      }
    }
  }

  return classes.join(' ');
};

// Unlike fromCamelToKebabCase, this leaves `-` so that `background-color` stays `background-color`
const fromCamelToKebabCaseWithDash = (text: string): string => {
  return text.replace(/([A-Z])/g, '-$1').toLowerCase();
};

export const stringifyStyle = (obj: any): string => {
  if (obj == null) {
    return '';
  }
  if (typeof obj == 'object') {
    if (isArray(obj)) {
      throw qError(QError.stringifyClassOrStyle, [obj, 'style']);
    } else {
      const chunks: string[] = [];
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          if (value != null && typeof value !== 'function') {
            if (key.startsWith('--')) {
              chunks.push(key + ':' + value);
            } else {
              chunks.push(fromCamelToKebabCaseWithDash(key) + ':' + setValueForStyle(key, value));
            }
          }
        }
      }
      return chunks.join(';');
    }
  }
  return String(obj);
};

export const serializeBooleanOrNumberAttribute = (value: any) => {
  return value != null ? String(value) : null;
};

export function serializeAttribute(
  key: string,
  value: any,
  styleScopedId?: string | null
): string | null | boolean {
  if (isClassAttr(key)) {
    const serializedClass = serializeClass(value as ClassList);
    value = styleScopedId
      ? styleScopedId + (serializedClass.length ? ' ' + serializedClass : serializedClass)
      : serializedClass;
  } else if (key === 'style') {
    value = stringifyStyle(value);
  } else if (isEnumeratedBooleanAttribute(key) || typeof value === 'number') {
    // aria attrs, tabindex etc.
    value = serializeBooleanOrNumberAttribute(value);
  } else if (value === false || value == null) {
    value = null;
  } else if (value === true && isPreventDefault(key)) {
    value = '';
  }
  return value;
}

function isEnumeratedBooleanAttribute(key: string) {
  return isAriaAttribute(key) || ['spellcheck', 'draggable', 'contenteditable'].includes(key);
}

export const setValueForStyle = (styleName: string, value: any) => {
  if (typeof value === 'number' && value !== 0 && !isUnitlessNumber(styleName)) {
    return value + 'px';
  }
  return value;
};

export function isAriaAttribute(prop: string): boolean {
  return prop.startsWith('aria-');
}

export const styleKey = (qStyles: QRL<string>, index: number): string => {
  assertQrl(qStyles);
  return `${hashCode(qStyles.$hash$)}-${index}`;
};
