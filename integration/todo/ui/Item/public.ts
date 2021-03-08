/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { jsxDeclareComponent, QRL } from '../../qoot.js';

/**
 * @fileoverview
 *
 */

export interface ItemProps {
  $item: string;
}

export const Item = jsxDeclareComponent<ItemProps>('todo-item', QRL`ui:/Item/template`);
