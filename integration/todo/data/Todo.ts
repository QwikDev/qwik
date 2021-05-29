/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import {
  markDirty,
  QRL,
  Entity,
  getInjector,
  EntityKey,
  entityStateKey,
  toEntityKey,
} from '../qwik.js';
import { Item, ItemEntity } from './Item.js';

export interface TodoProps {}

export interface Todo {
  completed: number;
  filter: 'active' | 'all' | 'completed';
  items: EntityKey<ItemEntity>[];
  nextId: number;
}

export class TodoEntity extends Entity<TodoProps, Todo> {
  static $qrl = QRL<ItemEntity>`data:/Todo#TodoEntity`;
  static $type = 'Todos';
  static $keyProps = ['todos'];
  static MOCK_USER = toEntityKey<TodoEntity>('todos:1234');

  filteredItems: EntityKey<ItemEntity>[] = [];

  async archive(): Promise<void> {
    return this.$invokeQRL(QRL<() => void>`data:/Todo_archive`);
  }

  async newItem(text: string): Promise<ItemEntity> {
    return this.$invokeQRL(QRL<(text: string) => Promise<ItemEntity>>`data:/Todo_newItem`, text);
  }

  remove(itemKey: EntityKey<ItemEntity>) {
    return this.$invokeQRL(
      QRL<(key: EntityKey<ItemEntity>) => Promise<void>>`data:/Todo_removeItem`,
      itemKey
    );
  }

  async setFilter(filter: 'active' | 'all' | 'completed') {
    const injector = getInjector(this.$element);
    const itemStatePromises = this.$state.items.map((itemKey) =>
      injector.getEntityState<ItemEntity>(itemKey)
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
      .map(entityStateKey as () => EntityKey<ItemEntity>); // TODO(type): fix cast
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
        ItemEntity.$hydrate(host, { id: '1' }, { completed: false, title: 'Read Qwik docs' }).$key,
        ItemEntity.$hydrate(host, { id: '2' }, { completed: false, title: 'Build HelloWorld' })
          .$key,
        ItemEntity.$hydrate(host, { id: '3' }, { completed: false, title: 'Profit' }).$key,
      ],
    };
  }
}
