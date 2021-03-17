/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { inject, markDirty } from '../../qoot.js';
import { ItemService } from '../Item/public.js';
import { ItemsService } from './public.js';

export default inject(
  ItemsService, //
  async function removeItem(this: ItemsService, itemKey: string): Promise<void> {
    (await ItemService.$hydrate(this.$injector.element, itemKey)).$release();
    const items = this.$state.items;
    items.splice(items.indexOf(itemKey), 1);
    markDirty(this);
  }
);
