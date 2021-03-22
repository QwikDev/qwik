/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { injectMethod, markDirty, getInjector } from '../../qoot.js';
import { ItemService } from '../Item/public.js';
import { ItemsService } from './public.js';

export default injectMethod(
  ItemsService, //
  async function archive(this: ItemsService) {
    const items = this.$state.items;
    const element = this.$element;
    const injector = getInjector(element);
    // TODO: It kind of sucks that we need to retrieve service if state would be enough.
    this.$state.items = (
      await Promise.all(items.map((key) => injector.getService<ItemService>(key)))
    )
      .filter((itemService) => !itemService.$state.completed)
      .map((itemService) => itemService.$key);

    this.$state.completed = 0;
    markDirty(this);
  }
);
