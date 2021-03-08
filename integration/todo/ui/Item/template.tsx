/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { Item, ItemService } from '../../data/Item/public.js';
import { inject, jsxFactory, provideComponentProp, provideServiceState, QRL } from '../../qoot.js';

/**
 * @fileoverview
 *
 */

/**
 */
export default inject(
  null,
  provideServiceState<ItemService>(provideComponentProp('$item')),
  function (todo: Item) {
    return (
      <li class={{ completed: todo.completed, editing: false /*this.editing*/ }}>
        <div class="view">
          <input
            class="toggle"
            type="checkbox" /* (click)="toggleCompletion(todo)" [checked]="todo.completed" */
            checked={todo.completed}
            on:click={QRL`ui:/Item/toggle?toggleState=.target.checked`}
          />
          <label /* (dblclick)="editTodo(todo)" */>{todo.title}</label>
          <button class="destroy" /* (click)="remove(todo)"  */></button>
        </div>
        <input
          class="edit"
          /* *ngIf="todo.editing" 
                  [value]="todo.title" #editedtodo (blur)="stopEditing(todo, editedtodo.value)" 
                  (keyup.enter)="updateEditingTodo(todo, editedtodo.value)" 
                  (keyup.escape)="cancelEditingTodo(todo)" */
        />
      </li>
    );
  }
);
