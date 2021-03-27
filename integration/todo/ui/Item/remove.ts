/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { provideUrlProp } from '../../qoot.js';
import { ItemsService } from '../../data/Items/public.js';
import { injectEventHandler, provideService } from '../../qoot.js';

export default injectEventHandler(
  // Providers
  null,
  provideService<ItemsService>(ItemsService.globalKey),
  provideUrlProp('itemKey'),
  // Handler
  async function remove(this: null, itemsService: ItemsService, itemKey: string) {
    itemsService.remove(itemKey);
  }
);
