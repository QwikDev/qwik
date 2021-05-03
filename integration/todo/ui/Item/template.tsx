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
  ServiceKey,
  Provider,
  Host,
} from '../../qoot.js';
import { ItemComponent } from './component.js';

// TODO: remove this by changing jsxFactory over to import
export const _needed_by_JSX_ = jsxFactory; // eslint-disable-line @typescript-eslint/no-unused-vars
export default injectMethod(
  ItemComponent,
  provideServiceState<ItemService>(
    (provideComponentProp('$item') as any) as Provider<ServiceKey<ItemService>> // TODO(type)
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
            on:click={QRL`ui:/Item/toggle?toggleState=.target.checked`}
          />
          <label on:dblclick={QRL`ui:/Item/edit.begin`}>{item.title}</label>
          <button class="destroy" on:click={QRL`ui:/Item/remove?itemKey=${itemKey}`}></button>
        </div>
        {this.editing ? (
          <input
            class="edit"
            value={item.title}
            on:blur={QRL`ui:/Item/edit.end`} // TODO: investigate why this sometimes does not fire
            on:keyup={QRL`ui:/Item/edit.change?value=.target.value&code=.code&itemKey=${itemKey}`}
          />
        ) : null}
      </Host>
    );
  }
);
