/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { ItemEntity } from '../data/Item.js';
import { Provider, EntityKey } from '../qwik.js';
import {
  injectEventHandler,
  markDirty,
  provideUrlProp,
  provideQrlExp,
  provideEntity,
} from '../qwik.js';
import { ItemComponent } from './Item_component.js';

export const begin = injectEventHandler(
  ItemComponent, //
  async function (this: ItemComponent) {
    this.editing = true;
    markDirty(this);
  }
);

export const change = injectEventHandler(
  ItemComponent, //
  provideQrlExp<string>('value'),
  provideQrlExp<string>('code'),
  provideEntity<ItemEntity>(provideUrlProp('itemKey') as any as Provider<EntityKey<ItemEntity>>), // TODO fix cast
  async function (
    this: ItemComponent,
    inputValue: string,
    charCode: string,
    itemEntity: ItemEntity
  ) {
    if (charCode === 'Enter') {
      itemEntity.$state.title = inputValue;
      markDirty(itemEntity);
      this.editing = false;
      markDirty(this);
    } else if (charCode === 'Escape') {
      this.editing = false;
      markDirty(this);
    }
  }
);

export const end = injectEventHandler(
  ItemComponent, //
  async function (this: ItemComponent) {
    this.editing = false;
    markDirty(this);
  }
);
