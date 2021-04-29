/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { jsxDeclareComponent, QRL, ServiceKey } from '../../qoot.js';
import type { TodoService } from '../../data/Todo/public';

export interface MainProps {
  $todos: ServiceKey<TodoService>;
}

// TODO: app-main looks like a web-component. Change it to 'section' to make it closer to the original TODO
export const Main = jsxDeclareComponent<MainProps>(QRL`ui:/Main/template`, 'section');
