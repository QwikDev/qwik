/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import {eventHandler, State} from './qoot.js';

export class MyItem extends State<MyItemState> {
  isEditable: boolean = false;
}

export interface MyItemState {
  item: string;
}

export interface MyItemRender {}

export const onDelete = eventHandler(
    function(this: MyItem) {
      console.log(this);
    },
);