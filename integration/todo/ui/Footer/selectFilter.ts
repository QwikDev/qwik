/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { injectEventHandler, provideService, provideEvent } from '../../qoot.js';
import { TodoService } from '../../data/Todo/public.js';

export default injectEventHandler(
  //
  null,
  provideService<TodoService>('items:'),
  provideEvent(),
  function (items: TodoService, event: Event) {
    items.setFilter((event as any).filter);
  }
);
