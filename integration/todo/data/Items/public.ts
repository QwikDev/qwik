/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { markDirty, QRL, Service, getInjector, ServiceKey, serviceStateKey } from '../../qoot.js';
import { Item, ItemService } from '../Item/public.js';

export interface ItemsProps {}

export interface Items {
  completed: number;
  // TODO(can we have some kind of a ref here?)
  filter: 'active' | 'all' | 'completed';
  items: string[];
  nextId: number;
}

// TODO: rename to ToDos
export class ItemsService extends Service<ItemsProps, Items> {
  static $qrl = QRL<ItemService>`data:/Items/public.ItemsService`;
  static $type = 'Items';
  static $keyProps = ['items'];

  static globalKey = 'items:';

  filteredItems: ServiceKey[] = [];

  async archive(): Promise<void> {
    return this.$invokeQRL(QRL<() => void>`data:/Items/archive`);
  }

  async newItem(text: string): Promise<ItemService> {
    return this.$invokeQRL(QRL<(text: string) => Promise<ItemService>>`data:/Items/newItem`, text);
  }

  remove(itemKey: string) {
    return this.$invokeQRL(QRL<(key: string) => Promise<void>>`data:/Items/removeItem`, itemKey);
  }

  async setFilter(filter: 'active' | 'all' | 'completed') {
    const injector = getInjector(this.$element);
    const itemStatePromises = this.$state.items.map((itemKey) =>
      injector.getServiceState<ItemService>(itemKey)
    );
    const items = await Promise.all(itemStatePromises);
    this.filteredItems = items
      .filter(
        {
          all: () => true,
          active: (item: Item) => !item.completed,
          completed: (item: Item) => item.completed,
        }[filter]
      )
      .map(serviceStateKey);
    markDirty(this);
  }

  async $init() {
    this.filteredItems = this.$state.items;
  }

  async $newState(): Promise<Items> {
    const host = this.$element;
    return {
      completed: 0,
      filter: 'all',
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
