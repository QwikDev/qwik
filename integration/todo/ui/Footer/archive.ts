/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { TodoService } from '../../data/Todo/public.js';
import { injectEventHandler, provideService } from '../../qoot.js';

/**
 * @fileoverview
 *
 */

/**
 */
export default injectEventHandler(
  null,
  provideService(TodoService.SINGLETON),
  async function (todoService: TodoService) {
    await todoService.archive();
  }
);
