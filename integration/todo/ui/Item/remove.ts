/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ItemService } from '../../data/Item/public.js';
import { TodoService } from '../../data/Todo/public.js';
import {
  injectEventHandler,
  provideService,
  provideUrlProp,
  ServiceKey,
  Provider,
} from '../../qoot.js';

const x = provideService(TodoService.globalKey);
console.log(x);
export default injectEventHandler(
  // Providers
  null,
  provideService<TodoService>(TodoService.globalKey), //TODO(type): why is generic needed? (service key already has the type)
  (provideUrlProp('itemKey') as unknown) as Provider<ServiceKey<ItemService>>, // TODO(type): add provider to clean this cast up
  // Handler
  async function remove(this: null, todoService: TodoService, itemKey: ServiceKey<ItemService>) {
    todoService.remove(itemKey);
  }
);
