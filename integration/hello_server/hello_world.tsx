/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { qJSX } from './qoot.js';
export const __ = qJSX;

export function helloWorld(props: { url: string }) {
    return (<span>Hello world! {props.url}</span>);
}

