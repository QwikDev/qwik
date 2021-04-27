/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ServiceKey, Provider, Host } from '../../qoot.js';
import { Item, ItemService } from '../../data/Item/public.js';
import {
  injectMethod,
  jsxFactory,
  provideComponentProp,
  provideServiceState,
  QRL,
} from '../../qoot.js';
import { ItemComponent } from './component.js';

export const _needed_by_JSX_ = jsxFactory; // eslint-disable-line @typescript-eslint/no-unused-vars
export default injectMethod(
  ItemComponent,
  provideServiceState<ItemService>(
    (provideComponentProp('$item') as any) as Provider<ServiceKey<ItemService>> // TODO(type)
  ),
  provideComponentProp('$item'),
  function (this: ItemComponent, todo: Item, itemKey: string) {
    return (
      <Host class={{ completed: todo.completed, editing: this.editing }}>
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
      </Host>
    );
  }
);
