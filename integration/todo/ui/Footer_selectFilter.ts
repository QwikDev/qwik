/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { injectEventHandler, provideEntity, provideEvent } from '../qwik.js';
import { TodoEntity } from '../data/Todo.js';

export default injectEventHandler(
  //
  null,
  provideEntity(TodoEntity.MOCK_USER),
  provideEvent(),
  function (todos: TodoEntity, event: Event) {
    todos.setFilter((event as any).filter);
  }
);
