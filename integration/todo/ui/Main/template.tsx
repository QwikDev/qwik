/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import type { Items, ItemsService } from '../../data/Items/public.js';
import {
  injectFunction,
  jsxFactory,
  provideComponentProp,
  provideServiceState,
} from '../../qoot.js';
import { Item } from '../Item/public.js';

export default injectFunction(
  provideServiceState<ItemsService>(provideComponentProp('$items')), //
  function (items: Items) {
    return (
      <section class="main" /* *ngIf="todoStore.todos.length > 0 " */>
        <input
          id="toggle-all"
          class="toggle-all"
          type="checkbox"
          /* *ngIf="todoStore.todos.length" #toggleall 
             [checked]="todoStore.allCompleted()" 
             (click)="todoStore.setAllTo(toggleall.checked)" */
        />
        <ul class="todo-list">
          {items.items.map((todo) => (
            <Item $item={todo} />
          ))}
        </ul>
      </section>
    );
  }
);

/* // TODO: Create QFor and QIf directive?
  <Q for="todos.value" do={(todo) => <Item $item={todo} />} />
  <Q if="todos.value.length > 0" then={(value) => <section></section>} />
*/
