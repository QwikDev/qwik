/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { ItemEntity } from '../data/Item';
import {
  Provider,
  EntityKey,
  injectEventHandler,
  markDirty,
  provideUrlProp,
  provideQrlExp,
  provideEntity,
} from '@builder.io/qwik';
import { ItemComponent } from './Item_component';

export const begin = injectEventHandler(
  ItemComponent, //
  provideEntity<ItemEntity>(provideUrlProp('itemKey') as any as Provider<EntityKey<ItemEntity>>), // TODO fix cast
  async function (this: ItemComponent, itemEntity: ItemEntity) {
    this.editing = true;
    await markDirty(this);
    // focus input element
    const inputEl = this.$host.querySelector('input.edit') as HTMLInputElement;
    inputEl.focus();
    // move cursor to the end
    inputEl.selectionStart = inputEl.selectionEnd = itemEntity.$state.title.length;
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
