/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { Component, QRL } from '../qwik.js';
import { HeaderProps } from './Header.js';

interface HeaderState {
  text: string;
}

export class HeaderComponent extends Component<HeaderProps, HeaderState> {
  static $templateQRL = QRL`ui:/Header_template`;
  $newState() {
    return { text: '' };
  }
}
