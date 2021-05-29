/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { QRL, Entity } from '../qwik.js';

export interface ItemProps {
  id: string;
}

export interface Item {
  completed: boolean;
  title: string;
}

// TODO: How can this be split into public / private part just like Components
export class ItemEntity extends Entity<ItemProps, Item> {
  static $type = 'Item'; // TODO(type): add as const
  static $qrl = QRL<ItemEntity>`data:/Item#ItemEntity`;
  static $keyProps = ['id'];
  async toggle(isCompleted: boolean): Promise<void> {
    return this.$invokeQRL(QRL<(isCompleted: boolean) => void>`data:/Item_toggle`, isCompleted);
  }
}
