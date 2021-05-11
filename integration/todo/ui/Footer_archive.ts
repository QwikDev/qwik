/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { TodoEntity } from '../data/Todo.js';
import { injectEventHandler, provideEntity } from '../qoot.js';

/**
 * @fileoverview
 *
 */

/**
 */
export default injectEventHandler(
  null,
  provideEntity(TodoEntity.MOCK_USER),
  async function (todoEntity: TodoEntity) {
    await todoEntity.archive();
  }
);
