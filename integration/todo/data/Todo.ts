/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import {
  markDirty,
  QRL,
  Service,
  getInjector,
  ServiceKey,
  serviceStateKey,
  toServiceKey,
} from '../qoot.js';
import { Item, ItemService } from './Item.js';

export interface TodoProps {}

export interface Todo {
  completed: number;
  filter: 'active' | 'all' | 'completed';
  items: ServiceKey<ItemService>[];
  nextId: number;
}

export class TodoService extends Service<TodoProps, Todo> {
  static $qrl = QRL<ItemService>`data:/Todo.TodoService`;
  static $type = 'Todos';
  static $keyProps = ['todos'];
  static SINGLETON = toServiceKey<TodoService>('todos:singleton');

  filteredItems: ServiceKey<ItemService>[] = [];

  async archive(): Promise<void> {
    return this.$invokeQRL(QRL<() => void>`data:/Todo_archive`);
  }

  async newItem(text: string): Promise<ItemService> {
    return this.$invokeQRL(QRL<(text: string) => Promise<ItemService>>`data:/Todo_newItem`, text);
  }

  remove(itemKey: ServiceKey<ItemService>) {
    return this.$invokeQRL(
      QRL<(key: ServiceKey<ItemService>) => Promise<void>>`data:/Todo_removeItem`,
      itemKey
    );
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
      .map(serviceStateKey as () => ServiceKey<ItemService>); // TODO(type): fix cast
    this.$state.filter = filter;
    markDirty(this);
  }

  async $init() {
    this.filteredItems = this.$state.items;
  }

  async $newState(): Promise<Todo> {
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
