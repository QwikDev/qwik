/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import {JSXNode} from './factory';
import {JSXRegistry} from './registry';

export function jsxRender(host: Node, jsxNode: JSXNode, registry: JSXRegistry) {
  console.log('jsxRender');
}