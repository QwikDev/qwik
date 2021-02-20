/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { InjectFn } from './inject';

export function extractValue(
  key: string,
  defaultValue: string | null = null
): InjectFn<string | null> {
  return async function (event: Event, target: Element, url: URL): Promise<string | null> {
    return url.searchParams.get(key) || defaultValue;
  };
}

export function extractValueRef<T>(key: string, defaultValue: T | null = null): InjectFn<T | null> {
  return async function (event: Event, target: Element, url: URL): Promise<T | null> {
    const path = url.searchParams.get(key);
    if (!path) return defaultValue;
    const [selector, propertyName] = path.split('.');
    const node = document.querySelector(selector);
    return (node as any)[propertyName];
  };
}
