/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { Items, ItemsService } from '../../data/Items/public.js';
import { QRL, inject, jsxFactory, provideComponentProp, provideServiceState } from '../../qoot.js';

/**
 * @fileoverview
 *
 */

/**
 */
// TODO: remove inject as it is not needed
export default inject(
  null,
  provideServiceState<ItemsService>(provideComponentProp('$items')),
  function (items: Items) {
    const remaining = items.items.length - items.completed;
    return (
      <footer class="footer" /* *ngIf="todoStore.todos.length > 0" */>
        <span class="todo-count">
          <strong>{remaining}</strong>
          {remaining == 1 ? ' item' : ' items'} left
        </span>
        {items.completed > 0 ? (
          <button
            class="clear-completed"
            $={{
              'on:click': QRL`ui:/Footer/archive`,
            }}
          >
            Clear completed
          </button>
        ) : null}
      </footer>
    );
  }
);
