/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { injectMethod, markDirty, getInjector } from '../../qoot.js';
import { TodoService } from './public.js';

export default injectMethod(
  TodoService, //
  async function archive(this: TodoService) {
    const items = this.$state.items;
    const element = this.$element;
    const injector = getInjector(element);
    this.$state.items = (await Promise.all(items.map((key) => injector.getService(key))))
      .filter((itemService) => {
        const completed = itemService.$state.completed;
        if (completed) {
          itemService.$release();
        }
        return !completed;
      })
      .map((itemService) => itemService.$key);

    this.$state.completed = 0;
    this.setFilter(this.$state.filter);
    markDirty(this);
  }
);
