/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ServiceKey, Provider } from '../qoot.js';
import { ItemService } from '../data/Item.js';
import {
  injectEventHandler,
  provideComponentProp,
  provideQrlExp,
  provideService,
} from '../qoot.js';

export default injectEventHandler(
  // Providers
  null,
  provideQrlExp<boolean>('toggleState'),
  provideService<ItemService>(
    (provideComponentProp('$item') as any) as Provider<ServiceKey<ItemService>>
  ), // TODO(type):
  // Handler
  async function (this: null, toggleState: boolean, itemService: ItemService) {
    await itemService.toggle(toggleState);
  }
);
