/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { eventHandler, extractValueRef, injectSourceElement } from './qoot.js';

export const click = eventHandler(extractValueRef<string>('name'), function (name: string | null) {
  alert('Hello ' + name + '!');
});

export const keydown = eventHandler(
  injectSourceElement(HTMLInputElement),
  function (element: HTMLInputElement) {
    const name = element.value;
    const span = element.parentElement?.querySelector('span')!;
    span.textContent = name;
  }
);
