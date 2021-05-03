/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import type { TodoService } from '../data/Todo.js';
import {
  injectFunction,
  jsxFactory,
  provideComponentProp,
  provideService,
  ServiceKey,
  Provider,
  Host,
} from '../qoot.js';
import { Item } from './Item.js';
// TODO(file_layout): Rework the file layout. I think it should be in same directory as loading `template.ts` looks weird
// - Main.ts // public.ts
// - Main_template.ts // template.ts
// - Main_action.ts // action.ts

export const _needed_by_JSX_ = jsxFactory; // eslint-disable-line @typescript-eslint/no-unused-vars
export default injectFunction(
  provideService<TodoService>(
    (provideComponentProp('$todos') as any) as Provider<ServiceKey<TodoService>>
  ), // TODO(type):
  function (todoService: TodoService) {
    const itemKeys = todoService.filteredItems;
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
