/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { Component } from '../../qoot.js';
import { HeaderProps } from '../Header/public.js';

/**
 * @fileoverview
 *
 * Declares the `GreeterComponent` `onKeyup` handler.
 */

interface HeaderState {
  text: string;
}

export class HeaderComponent extends Component<HeaderProps, HeaderState> {}
