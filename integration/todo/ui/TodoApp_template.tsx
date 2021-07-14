/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { ItemEntity } from '../data/Item';
import { TodoEntity } from '../data/Todo';
import { injectFunction, h } from '@builder.io/qwik';
import { Footer } from './Footer';
import { Header } from './Header';
import { Main } from './Main';

export default injectFunction(function () {
  return (
    <section class="todoapp" decl:entity={[TodoEntity, ItemEntity]}>
      <Header />
      <Main $todos={TodoEntity.MOCK_USER} />
      <Footer $todos={TodoEntity.MOCK_USER} />
    </section>
  );
});
