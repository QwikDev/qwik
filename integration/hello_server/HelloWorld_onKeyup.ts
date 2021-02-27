/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { inject, markDirty, injectUrlProperty } from './qoot.js';
import { HelloWorldComponent } from './HelloWorld_component.js';

export default inject(
  HelloWorldComponent,
  injectUrlProperty('value'),
  function (this: HelloWorldComponent, value: string) {
    this.$state.name = value;
    markDirty(this);
  }
);
