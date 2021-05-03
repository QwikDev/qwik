/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { injectMethod, markDirty, provideService } from '../qoot.js';
import { TodoService } from './Todo.js';
import { ItemService } from './Item.js';

export default injectMethod(
  ItemService,
  provideService(TodoService.SINGLETON),
  async function ItemService_toggle(
    this: ItemService,
    todoService: TodoService,
    isCompleted: boolean
  ) {
    this.$state.completed = !this.$state.completed;
    todoService.$state.completed += isCompleted ? +1 : -1;
    markDirty(todoService);
    markDirty(this);
  }
);
