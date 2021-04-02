/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ItemService } from '../../data/Item/public.js';
import { ItemsService } from '../../data/Items/public.js';
import { injectFunction, jsxFactory } from '../../qoot.js';
import { Footer } from '../Footer/public.js';
import { Header } from '../Header/public.js';
import { Main } from '../Main/public.js';

export const _needed_by_JSX_ = jsxFactory; // eslint-disable-line @typescript-eslint/no-unused-vars
export default injectFunction(function () {
  return (
    <section
      class="todoapp"
      $={{
        services: [ItemsService, ItemService],
      }}
    >
      <Header />
      <Main $items="items:" />
      <Footer $items="items:" />
    </section>
  );
});
