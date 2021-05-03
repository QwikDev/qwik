/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { TodoService } from '../data/Todo.js';
import { jsxDeclareComponent, QRL, ServiceKey } from '../qoot.js';

/**
 * @fileoverview
 *
 */

export interface FooterProps {
  $todos: ServiceKey<TodoService>;
}

export const Footer = jsxDeclareComponent<FooterProps>(QRL`ui:/Footer_template`, 'footer');
