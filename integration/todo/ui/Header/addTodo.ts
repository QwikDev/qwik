/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { markDirty } from '../../qoot.js';
import { ItemsService } from '../../data/Items/public.js';
import { injectEventHandler, provideQrlExp, provideService } from '../../qoot.js';
import { HeaderComponent } from './component.js';

/**
 * @fileoverview
 *
 */

/**
 */
export default injectEventHandler(
  HeaderComponent,
  provideQrlExp<string>('value'),
  provideQrlExp<string>('code'),
  provideService<ItemsService>('items:'),
  function (
    this: HeaderComponent,
    inputValue: string,
    charCode: string,
    itemsService: ItemsService
  ) {
    if (charCode === 'Enter' && inputValue) {
      console.log('ENTER', inputValue);
      itemsService.newItem(inputValue);
      this.$state.text = '';
      markDirty(this);
    }
  }
);
