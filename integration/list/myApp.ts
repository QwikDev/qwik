/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import {MyItemState} from './myItem';
import {eventHandler, injectSourceElement, State} from './qoot.js';

export class MyApp implements State<MyAppState> {
  state!: MyAppState;
}

export interface MyAppState {
  list: string[]
}

export interface MyAppRender extends MyAppState {
  myItems: MyItemState[]
}

export const onInputChange = eventHandler(
    injectSourceElement(HTMLInputElement),
    function(this: MyApp, input: HTMLInputElement) {
      const newList =
          input.value.split(',').map(s => s.trim()).filter(s => !!s);
      console.log(this, newList);
      this.state.list = newList;
    },
)

export function transform(myApp: MyAppState): MyAppRender {
  return {
    ...myApp, myItems: myApp.list.map(l => ({item: l} as MyItemState)),
  }
}