/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { qJSX } from './qoot.js';
export const __ = qJSX;

export function helloWorld(props: { name: string }) {
  return (
    <div>
      <div>
        Your name:
        <input
          value={props.name}
          $={{
            'on:keyup': './greet.change',
          }}
        />
      </div>
      <span>Hello {props.name}!</span>
    </div>
  );
}
