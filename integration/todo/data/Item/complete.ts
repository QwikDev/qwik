/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { inject, provideService } from '../../qoot.js';
import { ItemService } from './public.js';
import { ItemsService } from '../Items/public.js';

export default inject(
  ItemService,
  provideService<ItemsService>('items:'),
  function archive(this: ItemService, itemsService: ItemsService) {
    console.log('Items.complete()', this, itemsService);
  }
);
