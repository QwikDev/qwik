/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ItemService } from '../../data/Item/public.js';
import {
  injectEventHandler,
  provideComponentProp,
  provideQrlExp,
  provideService,
} from '../../qoot.js';

/**
 * @fileoverview
 *
 */

/**
 */
export default injectEventHandler(
  // Providers
  null,
  provideQrlExp<boolean>('toggleState'),
  provideService<ItemService>(provideComponentProp('$item')),
  // Handler
  async function (this: null, toggleState: boolean, itemService: ItemService) {
    console.log('Todo#toggle', toggleState);
    await itemService.toggle(toggleState);
  }
);
