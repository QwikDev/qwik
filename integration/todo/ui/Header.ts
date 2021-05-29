/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { jsxDeclareComponent, QRL } from '../qwik.js';

export interface HeaderProps {}

export const Header = jsxDeclareComponent<HeaderProps>(QRL`ui:/Header_template`, 'header', {
  class: 'header',
});
