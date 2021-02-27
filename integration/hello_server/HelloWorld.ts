/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { jsxDeclareComponent, QRL } from './qoot.js';

/**
 * @fileoverview
 *
 * The purpose of this file is to break symbolic dependency between the use of
 * `<hello-world>` with the rendering details of `<hello-world>`.
 */

export interface HelloWorldProps {
  name: string;
}

export const HelloWorldQRL = QRL`./HelloWorld_template`;

// <hello-world ::="./HelloWorld_render"/>
// - ./HelloWorld_render: invoked when component needs to be re-rendered.
export const HelloWorld = jsxDeclareComponent<HelloWorldProps>('hello-world', HelloWorldQRL);
