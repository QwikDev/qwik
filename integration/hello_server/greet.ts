/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { eventHandler, injectSourceElement } from './qoot.js';

export const change = eventHandler(
  injectSourceElement(HTMLInputElement),
  function (element: HTMLInputElement) {
    const name = element.value;
    const span = element.parentElement?.querySelector('span')!;
    span.textContent = name;
  }
);
