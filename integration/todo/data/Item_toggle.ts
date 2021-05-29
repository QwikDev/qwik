/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { injectMethod, markDirty, provideEntity } from '../qwik.js';
import { TodoEntity } from './Todo.js';
import { ItemEntity } from './Item.js';

export default injectMethod(
  ItemEntity,
  provideEntity(TodoEntity.MOCK_USER),
  async function ItemEntity_toggle(this: ItemEntity, todoEntity: TodoEntity, isCompleted: boolean) {
    this.$state.completed = !this.$state.completed;
    todoEntity.$state.completed += isCompleted ? +1 : -1;
    markDirty(todoEntity);
    markDirty(this);
  }
);
