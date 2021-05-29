/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { dirname, setConfig } from './qwik.js';

setConfig({
  baseURI: dirname(import.meta.url),
  protocol: {
    ui: './ui',
    data: './data',
    base: '.',
  },
});
