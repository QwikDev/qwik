/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { Item, ItemEntity } from '../data/Item.js';
import {
  injectMethod,
  jsxFactory,
  provideComponentProp,
  provideEntityState,
  QRL,
  EntityKey,
  Provider,
  Host,
} from '../qwik.js';
import { ItemComponent } from './Item_component.js';

// TODO: remove this by changing jsxFactory over to import
export const _needed_by_JSX_ = jsxFactory; // eslint-disable-line @typescript-eslint/no-unused-vars
export default injectMethod(
  ItemComponent,
  provideEntityState<ItemEntity>(
    provideComponentProp('$item') as any as Provider<EntityKey<ItemEntity>> // TODO(type)
  ),
  provideComponentProp('$item'),
  function (this: ItemComponent, item: Item, itemKey: string) {
    return (
      <Host class={{ completed: item.completed, editing: this.editing }}>
        <div class="view">
          <input
            class="toggle"
            type="checkbox"
            checked={item.completed}
            on:click={QRL`ui:/Item_toggle#?toggleState=.target.checked`}
          />
          <label on:dblclick={QRL`ui:/Item_edit#begin`}>{item.title}</label>
          <button class="destroy" on:click={QRL`ui:/Item_remove#?itemKey=${itemKey}`}></button>
        </div>
        {this.editing ? (
          <input
            class="edit"
            value={item.title}
            on:blur={QRL`ui:/Item_edit#end`} // TODO: investigate why this sometimes does not fire
            on:keyup={QRL`ui:/Item_edit#change?value=.target.value&code=.code&itemKey=${itemKey}`}
          />
        ) : null}
      </Host>
    );
  }
);
