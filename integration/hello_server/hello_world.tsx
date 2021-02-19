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
  const p = import('./qoot.js');
  const name = 'World';
  return (
    <div>
      <div>
        <input
          value={name}
          $={{
            '(change)': './greet.change',
          }}
        />
      </div>
      <span>Hello {name}!</span>[{props.url}]
    </div>
  );
}
