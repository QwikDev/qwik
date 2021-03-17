/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { inject, provideService, markDirty } from '../../qoot.js';
import { ItemService } from './public.js';
import { ItemsService } from '../Items/public.js';

export default inject(
  ItemService,
  provideService<ItemsService>('items:'),
  async function ItemService_toggle(
    this: ItemService,
    itemsService: ItemsService,
    isCompleted: boolean
  ) {
    this.$state.completed = !this.$state.completed;
    itemsService.$state.completed += isCompleted ? +1 : -1;
    markDirty(itemsService);
    markDirty(this);
  }
);
