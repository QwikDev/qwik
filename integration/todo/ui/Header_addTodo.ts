/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { TodoEntity } from '../data/Todo.js';
import {
  injectEventHandler,
  provideQrlExp,
  provideEntity,
  markDirty,
  provideProviderOf,
} from '../qwik.js';
import { HeaderComponent } from './Header_component.js';

export default injectEventHandler(
  HeaderComponent,
  provideQrlExp<string>('value'),
  provideQrlExp<string>('code'),
  provideProviderOf(provideEntity(TodoEntity.MOCK_USER)),
  async function (
    this: HeaderComponent,
    inputValue: string,
    charCode: string,
    todoEntity: () => Promise<TodoEntity>
  ) {
    if (charCode === 'Enter' && inputValue) {
      (await todoEntity()).newItem(inputValue);
      this.$state.text = '';
      markDirty(this);
    }
  }
);
