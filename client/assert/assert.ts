/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

export function assertDefined(value: any, text?: string) {
  if (value != null) return;
  throw newError(text || 'Expected defined value.');
}
export function assertNotPromise(value: any, text?: string) {
  if (!(value instanceof Promise)) return;
  throw newError(text || 'Expected defined value.');
}

export function assertDefinedAndNotPromise(value: any, text?: string) {
  assertDefined(value, text);
  assertNotPromise(value, text);
}

export function assertInstanceOf(value: any, type: any, text?: string) {
  if (value instanceof type) return;
  throw newError(
    text || `Expected value '${value}' to be instance of '${type}' but was '${typeOf(value)}'.`
  );
}

export function assertString(value: any, text?: string) {
  if (typeof value === 'string') return;
  throw newError(text || `Expected value '${value}' to be 'string' but was '${typeOf(value)}'.`);
}

export function assertNotEqual(value1: any, value2: any, text?: string) {
  if (value1 !== value2) return;
  throw newError(text || `Expected '${value1}' !== '${value2}'.`);
}

function typeOf(value: any) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'object') {
    return value?.constructor?.name || '<unknown>';
  } else {
    return type;
  }
}

export function newError(text: string) {
  debugger;
  return new Error(text);
}
