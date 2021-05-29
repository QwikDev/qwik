/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { Component, QRL } from '../qwik.js';
import { ItemProps } from './Item.js';

interface ItemState {}

export class ItemComponent extends Component<ItemProps, ItemState> {
  static $templateQRL = QRL`ui:/Item_template`;

  editing = false;
  $newState() {
    return {};
  }
}
