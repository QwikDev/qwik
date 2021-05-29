/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { ItemEntity } from '../data/Item.js';
import { jsxDeclareComponent, QRL, EntityKey } from '../qwik.js';

export interface ItemProps {
  $item: EntityKey<ItemEntity>;
}

export const Item = jsxDeclareComponent<ItemProps>(QRL`ui:/Item_template`, 'li');
