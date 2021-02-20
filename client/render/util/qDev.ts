/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import global from './global.js';

declare global {
  const qDev: boolean;
}

if (typeof qDev === 'undefined') {
  global.qDev = true;
  if (typeof qDev === 'undefined') {
    throw new Error('We seem to have the wrong');
  }
}
