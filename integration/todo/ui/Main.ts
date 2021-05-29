/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { jsxDeclareComponent, QRL, EntityKey } from '../qwik.js';
import type { TodoEntity } from '../data/Todo.js';

export interface MainProps {
  $todos: EntityKey<TodoEntity>;
}

export const Main = jsxDeclareComponent<MainProps>(QRL`ui:/Main_template`, 'section');
