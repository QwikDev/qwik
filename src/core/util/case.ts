/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

const camelToKebabCase = new Map<string, string>();
export function fromCamelToKebabCase(text: string, includeFirst?: boolean): string;
export function fromCamelToKebabCase(text: string | null, includeFirst?: boolean): string | null;
export function fromCamelToKebabCase(
  text: string | null,
  includeFirst: boolean = false
): string | null {
  if (typeof text != 'string') return text;
  const value = camelToKebabCase.get(text);
  if (value != null) return value;
  let converted = '';
  for (let x = 0; x < text.length; x++) {
    const ch = text.charAt(x);
    if (isUpperCase(ch)) {
      converted += (x != 0 || includeFirst ? '-' : '') + ch.toLowerCase();
    } else {
      converted += ch;
    }
  }
  camelToKebabCase.set(text, converted);
  return converted;
}

const kebabToCamelCase = new Map<string, string>();

export function fromKebabToCamelCase(
  text: string,
  capitalizeFirstCharacter: boolean = true
): string {
  const value = kebabToCamelCase.get(text);
  if (value != null) return value;
  let converted = '';
  let wasKebab = capitalizeFirstCharacter;
  for (let x = 0; x < text.length; x++) {
    const ch = text.charAt(x);
    if (isKebab(ch)) {
      wasKebab = true;
    } else if (wasKebab) {
      wasKebab = false;
      converted += ch.toUpperCase();
    } else {
      converted += ch;
    }
  }
  kebabToCamelCase.set(text, converted);
  return converted;
}

function isUpperCase(ch: string): boolean {
  return 'A' <= ch && ch <= 'Z';
}

function isKebab(ch: string): boolean {
  return ch === '-';
}
