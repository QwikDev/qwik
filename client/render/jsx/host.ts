/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { jsxFactory } from './factory.js';
import { JSXNode } from './types.js';

// TODO: Docs
// TODO: Test
export function Host(props: any, children: any): JSXNode<any> {
  return jsxFactory('host', props, props.children);
}
