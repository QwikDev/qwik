/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { Props } from '../../injector/types.js';

/**
 * @public
 */
export type JSXFactory = (props: Props) => JSXNode<unknown>;

/**
 * @public
 */
export interface JSXNode<T extends string | null | JSXFactory | unknown> {
  tag: T;
  props: Props;
  children: Array<any>;
}
