/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { injectMethod, markDirty, EntityKey } from '../qwik.js';
import { ItemEntity } from './Item.js';
import { TodoEntity } from './Todo.js';

export default injectMethod(
  TodoEntity, //
  async function removeItem(this: TodoEntity, itemKey: EntityKey<ItemEntity>): Promise<void> {
    (await ItemEntity.$hydrate(this.$element, itemKey)).$release();
    const items = this.$state.items;
    items.splice(items.indexOf(itemKey), 1);
    this.setFilter(this.$state.filter);
    markDirty(this);
  }
);
