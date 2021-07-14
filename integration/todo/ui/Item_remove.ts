/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { ItemEntity } from '../data/Item';
import { TodoEntity } from '../data/Todo';
import {
  injectEventHandler,
  provideEntity,
  provideUrlProp,
  EntityKey,
  Provider,
} from '@builder.io/qwik';

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
