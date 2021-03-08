/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { dirname, setConfig } from './qoot.js';

setConfig({
  baseURI: dirname(import.meta.url),
  protocol: {
    ui: './ui',
    data: './data',
  },
});
