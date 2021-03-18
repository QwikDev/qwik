/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { Item, ItemService } from '../../data/Item/public.js';
import { inject, jsxFactory, provideComponentProp, provideServiceState, QRL } from '../../qoot.js';

export default inject(
  null,
  provideServiceState<ItemService>(provideComponentProp('$item')),
  provideComponentProp('$item'),
  function (todo: Item, itemKey: string) {
    const editing = false;
    return (
      <li class={{ completed: todo.completed, editing: editing }}>
        <div class="view">
          <input
            class="toggle"
            type="checkbox"
            checked={todo.completed}
            on:click={QRL`ui:/Item/toggle?toggleState=.target.checked`}
          />
          <label /* (dblclick)="editTodo(todo)" */>{todo.title}</label>
          <button class="destroy" on:click={QRL`ui:/Item/remove?itemKey=${itemKey}`}
          ></button>
        </div>
        {editing ? 
          <input
            class="edit"
                  value={todo.title}
                  on:blur="stopEditing(todo, editedtodo.value)" 
                  on:keyup="updateEditingTodo(todo, editedtodo.value) / cancelEditingTodo(todo)"
          />: null}
      </li>
    );
  }
);
