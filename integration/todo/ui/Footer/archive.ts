/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ItemsService } from '../../data/Items/public.js';
import { injectEventHandler, provideService } from '../../qoot.js';

/**
 * @fileoverview
 *
 */

/**
 */
export default injectEventHandler(
  null,
  provideService<ItemsService>(ItemsService.globalKey),
  async function (itemsService: ItemsService) {
    await itemsService.archive();
  }
);
