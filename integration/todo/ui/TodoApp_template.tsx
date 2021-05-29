/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { ItemEntity } from '../data/Item.js';
import { TodoEntity } from '../data/Todo.js';
import { injectFunction, jsxFactory } from '../qwik.js';
import { Footer } from './Footer.js';
import { Header } from './Header.js';
import { Main } from './Main.js';

export const _needed_by_JSX_ = jsxFactory; // eslint-disable-line @typescript-eslint/no-unused-vars
export default injectFunction(function () {
  return (
    <section class="todoapp" decl:entity={[TodoEntity, ItemEntity]}>
      <Header />
      <Main $todos={TodoEntity.MOCK_USER} />
      <Footer $todos={TodoEntity.MOCK_USER} />
    </section>
  );
});
