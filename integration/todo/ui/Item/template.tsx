/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { Item, ItemService } from '../../data/Item/public.js';
import {
  injectMethod,
  jsxFactory,
  provideComponentProp,
  provideServiceState,
  QRL,
} from '../../qoot.js';
import { ItemComponent } from './component.js';

export default injectMethod(
  ItemComponent,
  provideServiceState<ItemService>(provideComponentProp('$item')),
  provideComponentProp('$item'),
  function (this: ItemComponent, todo: Item, itemKey: string) {
    return (
      <li class={{ completed: todo.completed, editing: this.editing }}>
        <div class="view">
          <input
            class="toggle"
            type="checkbox"
            checked={todo.completed}
            $={{
              'on:click': QRL`ui:/Item/toggle?toggleState=.target.checked`,
            }}
          />
          <label
            $={{
              'on:dblclick': QRL`ui:/Item/edit.begin`,
            }}
          >
            {todo.title}
          </label>
          <button
            class="destroy"
            $={{ 'on:click': QRL`ui:/Item/remove?itemKey=${itemKey}` }}
          ></button>
        </div>
        {this.editing ? (
          <input
            class="edit"
            value={todo.title}
            $={{
              'on:focusout': QRL`ui:/Item/edit.end`,
              'on:keyup': QRL`ui:/Item/edit.change?value=.target.value&code=.code&itemKey=${itemKey}`,
            }}
          />
        ) : null}
      </li>
    );
  }
);
