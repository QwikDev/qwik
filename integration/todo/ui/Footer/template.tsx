/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { inject, jsxFactory } from '../../qoot.js';

/**
 * @fileoverview
 *
 */

/**
 */
// TODO: remove inject as it is not needed
export default inject(null, function () {
  const todoStore = {
    getRemaining: function () {
      return ['item'];
    },
  };
  return (
    <footer class="footer" /* *ngIf="todoStore.todos.length > 0" */>
      <span class="todo-count">
        <strong>{todoStore.getRemaining().length}</strong>
        {todoStore.getRemaining().length == 1 ? 'item' : 'items'} left
      </span>
      <button
        class="clear-completed" /* *ngIf="todoStore.getCompleted().length > 0" (click)="removeCompleted()" */
      >
        Clear completed
      </button>
    </footer>
  );
});
