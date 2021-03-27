/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { QRL, Service } from '../../qoot.js';

export interface ItemProps {
  id: string;
}

export interface Item {
  completed: boolean;
  title: string;
}

// TODO: How can this be split into public / private part just like Components
export class ItemService extends Service<ItemProps, Item> {
  static $type = 'Item';
  static $qrl = QRL<ItemService>`data:/Item/public.ItemService`;
  static $keyProps = ['id'];
  async toggle(isCompleted: boolean): Promise<void> {
    return this.$invokeQRL(QRL<(isCompleted: boolean) => void>`data:/Item/toggle`, isCompleted);
  }
}
