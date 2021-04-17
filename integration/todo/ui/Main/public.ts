/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { jsxDeclareComponent, QRL } from '../../qoot.js';

export interface MainProps {
  $todos: string;
}

export const Main = jsxDeclareComponent<MainProps>('app-main', QRL`ui:/Main/template`);
