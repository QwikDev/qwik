/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ItemService } from '../../data/Item/public.js';
import { ItemsService } from '../../data/Items/public.js';
import { inject, jsxFactory } from '../../qoot.js';
import { Footer } from '../Footer/public.js';
import { Header } from '../Header/public.js';
import { Main } from '../Main/public.js';

/**
 * @fileoverview
 *
 */

/**
 */
export default inject(
  // Providers
  null,
  // Handler
  function () {
    return (
      <section
        class="todoapp"
        $={{
          services: [ItemsService, ItemService],
        }}
      >
        <Header />
        <Main />
        <Footer />
      </section>
    );
  }
);
