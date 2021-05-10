/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ItemService } from '../data/Item.js';
import { TodoService } from '../data/Todo.js';
import {
  injectEventHandler,
  provideService,
  provideUrlProp,
  ServiceKey,
  Provider,
} from '../qoot.js';

export default injectEventHandler(
  // Providers
  null,
  provideService(TodoService.SINGLETON),
  provideUrlProp('itemKey') as unknown as Provider<ServiceKey<ItemService>>, // TODO(type): add provider to clean this cast up
  // Handler
  async function remove(this: null, todoService: TodoService, itemKey: ServiceKey<ItemService>) {
    todoService.remove(itemKey);
  }
);
