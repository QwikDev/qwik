/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { ItemEntity } from '../data/Item.js';
import { TodoEntity } from '../data/Todo.js';
import { injectEventHandler, provideEntity, provideUrlProp, EntityKey, Provider } from '../qwik.js';

export default injectEventHandler(
  // Providers
  null,
  provideEntity(TodoEntity.MOCK_USER),
  provideUrlProp('itemKey') as unknown as Provider<EntityKey<ItemEntity>>, // TODO(type): add provider to clean this cast up
  // Handler
  async function remove(this: null, todoEntity: TodoEntity, itemKey: EntityKey<ItemEntity>) {
    todoEntity.remove(itemKey);
  }
);
