/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { injectMethod, provideService, markDirty } from '../../qoot.js';
import { ItemService } from './public.js';
import { TodoService } from '../Todo/public.js';

export default injectMethod(
  ItemService,
  provideService<TodoService>('items:'),
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
