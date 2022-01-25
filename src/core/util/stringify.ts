/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

export function stringify(value: any): string | null {
  return value == null ? null : String(value);
}

export function debugStringify(value: any): string {
  if (value != null && typeof value == 'object') {
    return String(value.constructor.name) + '\n' + safeJSONStringify(value);
  }
  return String(value);
}

function safeJSONStringify(value: any) {
  try {
    return JSON.stringify(value, null, '  ');
  } catch (e) {
    return String(e);
  }
}
