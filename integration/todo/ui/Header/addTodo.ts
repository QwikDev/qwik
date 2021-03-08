/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { HeaderComponent } from './component.js';
import { injectEventHandler, provideQrlExp } from '../../qoot.js';

/**
 * @fileoverview
 *
 */

/**
 */
export default injectEventHandler(
  HeaderComponent,
  provideQrlExp<string>('value'),
  provideQrlExp<string>('code'),
  function (this: HeaderComponent, inputValue: string, charCode: string) {
    if (charCode === 'Enter') {
      console.log('ENTER', inputValue);
    }
  }
);
