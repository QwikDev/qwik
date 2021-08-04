/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { Component } from '@builder.io/qwik';
import type { ItemProps } from './Item';

interface ItemState {}

export class ItemComponent extends Component<ItemProps, ItemState> {
  editing = false;
  $newState() {
    return {};
  }
}
