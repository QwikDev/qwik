/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { jsxFactory, jsxRender } from './qoot.js';
import HelloWorld from './HelloWorld.js';

export function serverMain(document: Document) {
  const doc = (
    <html>
      <head>
        <title>Hello World from Server</title>
        <script src="/qootloader.js" async></script>
      </head>
      <body>
        <HelloWorld name="World" />
      </body>
    </html>
  );
  return jsxRender(document, doc, null, document);
}
