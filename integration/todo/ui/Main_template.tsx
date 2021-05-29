/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { TodoEntity } from '../data/Todo.js';
import {
  injectFunction,
  jsxFactory,
  provideComponentProp,
  provideEntity,
  EntityKey,
  Provider,
  Host,
} from '../qwik.js';
import { Item } from './Item.js';
// TODO(file_layout): Rework the file layout. I think it should be in same directory as loading `template.ts` looks weird
// - Main.ts // public.ts
// - Main_template.ts // template.ts
// - Main_action.ts // action.ts

export const _needed_by_JSX_ = jsxFactory; // eslint-disable-line @typescript-eslint/no-unused-vars
export default injectFunction(
  provideEntity<TodoEntity>(
    provideComponentProp('$todos') as any as Provider<EntityKey<TodoEntity>>
  ), // TODO(type):
  function (todoEntity: TodoEntity) {
    const itemKeys = todoEntity.filteredItems;
    return (
      <Host class="main" /* TODO *ngIf="todoStore.todos.length > 0 " */>
        <input
          id="toggle-all"
          class="toggle-all"
          type="checkbox"
          /* TODO *ngIf="todoStore.todos.length" #toggleall 
             [checked]="todoStore.allCompleted()" 
             (click)="todoStore.setAllTo(toggleall.checked)" */
        />
        <ul class="todo-list">
          {itemKeys.map((key) => (
            <Item $item={key} />
          ))}
        </ul>
      </Host>
    );
  }
);

/* // TODO: Create QFor and QIf directive?
  <Q for="todos.value" do={(todo) => <Item $item={todo} />} />
  <Q if="todos.value.length > 0" then={(value) => <section></section>} />
*/
