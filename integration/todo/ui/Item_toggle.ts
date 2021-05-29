/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { EntityKey, Provider } from '../qwik.js';
import { ItemEntity } from '../data/Item.js';
import { injectEventHandler, provideComponentProp, provideQrlExp, provideEntity } from '../qwik.js';

export default injectEventHandler(
  // Providers
  null,
  provideQrlExp<boolean>('toggleState'),
  provideEntity<ItemEntity>(
    provideComponentProp('$item') as any as Provider<EntityKey<ItemEntity>>
  ), // TODO(type):
  // Handler
  async function (this: null, toggleState: boolean, itemEntity: ItemEntity) {
    await itemEntity.toggle(toggleState);
  }
);
