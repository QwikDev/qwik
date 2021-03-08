/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { QRL, Service } from '../../qoot.js';
import { Item, ItemService } from '../Item/public.js';

export interface ItemsProps {}

export interface Items {
  completed: number;
  // TODO(can we have some kind of a ref here?)
  items: string[];
  nextId: number;
}

export const ItemsServiceName = 'Items';

// TODO: rename to ToDos
export class ItemsService extends Service<ItemsProps, Items> {
  static $qrl = QRL<ItemService>`data:/Items/public.ItemsService`;
  static $name = ItemsServiceName;
  static $keyProps = ['items'];

  async archive(): Promise<void> {
    return this.$invokeQRL(QRL<() => void>`data:/Items/complete`);
  }

  async newItem(): Promise<Item> {
    return this.$invokeQRL(QRL<() => Item>`data:/Items/newItem`);
  }

  async $materializeState(props: ItemsProps): Promise<Items> {
    // TODO: figure out how we can return a Promise<Items> here.
    //constructor: QRL`data:/Items/constructor`,
    const host = this.$injector.element;
    return {
      completed: 0,
      nextId: 4,
      items: [
        ItemService.$hydrate(host, { id: '1' }, { completed: false, title: 'Read Qoot docs' }).$key,
        ItemService.$hydrate(host, { id: '2' }, { completed: false, title: 'Build HelloWorld' })
          .$key,
        ItemService.$hydrate(host, { id: '3' }, { completed: false, title: 'Profit' }).$key,
      ],
    };
  }
}
