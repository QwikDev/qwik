/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { injectMethod, markDirty, ServiceKey } from '../../qoot.js';
import { ItemService } from '../Item/public.js';
import { TodoService } from './public.js';

export default injectMethod(
  TodoService, //
  async function removeItem(this: TodoService, itemKey: ServiceKey<ItemService>): Promise<void> {
    (await ItemService.$hydrate(this.$element, itemKey)).$release();
    const items = this.$state.items;
    items.splice(items.indexOf(itemKey), 1);
    this.setFilter(this.$state.filter);
    markDirty(this);
  }
);
