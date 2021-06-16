/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import './qDev.js';

export const EMPTY_ARRAY = [];
if (qDev) {
  Object.freeze(EMPTY_ARRAY);
}

export const EMPTY_OBJ = {};
if (qDev) {
  Object.freeze(EMPTY_OBJ);
}
