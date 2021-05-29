/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { injectMethod, markDirty } from '../qwik.js';
import { ItemEntity } from './Item.js';
import { TodoEntity } from './Todo.js';

export default injectMethod(
  TodoEntity, //
  function newItem(this: TodoEntity, newTitle: string): Promise<ItemEntity> {
    const itemEntity = ItemEntity.$hydrate(
      this.$element,
      { id: String(this.$state.nextId++) },
      { completed: false, title: newTitle }
    );
    this.$state.items.push(itemEntity.$key);
    this.setFilter(this.$state.filter);
    markDirty(this);
    return itemEntity;
  }
);
