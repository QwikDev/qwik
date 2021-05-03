/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ItemService } from '../data/Item.js';
import { jsxDeclareComponent, QRL, ServiceKey } from '../qoot.js';

export interface ItemProps {
  $item: ServiceKey<ItemService>;
}

export const Item = jsxDeclareComponent<ItemProps>(QRL`ui:/Item_template`, 'li');
