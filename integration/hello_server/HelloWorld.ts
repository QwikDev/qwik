/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { jsxDeclareComponent } from './qoot.js';

/**
 * @fileoverview
 *
 * The purpose of this file is to break symbolic dependency between the use of
 * `<hello-world>` with the rendering details of `<hello-world>`.
 */

export interface HelloWorldProps {
  name: string;
}

export default jsxDeclareComponent<HelloWorldProps>('hello-world', './HelloWorld_render');
