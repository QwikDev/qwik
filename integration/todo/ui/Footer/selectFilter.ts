/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { injectEventHandler, provideService, provideEvent } from '../../qoot.js';
import { ItemsService } from '../../data/Items/public.js';

export default injectEventHandler(
  //
  null,
  provideService<ItemsService>('items:'),
  provideEvent(),
  function (items: ItemsService, event: Event) {
    items.setFilter((event as any).filter);
  }
);
