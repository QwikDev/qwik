/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { TodoEntity } from '../data/Todo';
import { jsxDeclareComponent, QRL, EntityKey } from '@builder.io/qwik';

/**
 * @fileoverview
 *
 */

export interface FooterProps {
  $todos: EntityKey<TodoEntity>;
}

export const Footer = jsxDeclareComponent<FooterProps>(QRL`ui:/Footer_template`, 'footer');
