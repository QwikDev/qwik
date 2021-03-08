/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { Props } from '../../injection/types.js';

export type JSXFactory = (props: Props) => JSXNode<unknown>;

export interface JSXNode<T extends string | null | JSXFactory | unknown> {
  tag: T;
  props: Props;
  children: Array<any>;
}
