/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { injectMethod, markDirty, getInjector } from '../qwik.js';
import { TodoEntity } from './Todo.js';

export default injectMethod(
  TodoEntity, //
  async function archive(this: TodoEntity) {
    const items = this.$state.items;
    const element = this.$element;
    const injector = getInjector(element);
    this.$state.items = (await Promise.all(items.map((key) => injector.getEntity(key))))
      .filter((itemEntity) => {
        const completed = itemEntity.$state.completed;
        if (completed) {
          itemEntity.$release();
        }
        return !completed;
      })
      .map((itemEntity) => itemEntity.$key);

    this.$state.completed = 0;
    this.setFilter(this.$state.filter);
    markDirty(this);
  }
);
