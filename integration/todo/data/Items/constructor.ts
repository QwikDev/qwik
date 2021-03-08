/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { inject } from '../../qoot.js';
import { ItemService } from '../Item/public.js';
import { Items } from './public.js';

export default inject(
  null, //
  ItemService,
  function ItemsConstructor(ItemService: ItemService) {
    console.log('Items.constructor');
  }
);
