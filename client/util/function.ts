/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

export function namedFn<T>(name: string, delegate: T): T {
  try {
    return new Function(
      'delegate',
      `return function ${name}() {
        return delegate.apply(this, arguments);
      }`
    )(delegate);
  } catch {
    try {
      Object.defineProperty(delegate, 'name', { value: name });
    } catch {
      // eslint-disable-line no-empty
    }
  }
  return delegate;
}
