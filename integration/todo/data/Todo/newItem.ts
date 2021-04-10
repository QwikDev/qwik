/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { injectMethod, markDirty } from '../../qoot.js';
import { ItemService } from '../Item/public.js';
import { TodoService } from './public.js';

export default injectMethod(
  TodoService, //
  function newItem(this: TodoService, newTitle: string): Promise<ItemService> {
    const itemService = ItemService.$hydrate(
      this.$element,
      { id: String(this.$state.nextId++) },
      { completed: false, title: newTitle }
    );
    this.$state.items.push(itemService.$key);
    markDirty(this);
    return itemService;
  }
);
