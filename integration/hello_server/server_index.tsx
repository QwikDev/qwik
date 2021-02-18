/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

/// <reference types="./jsx_types" />

import { qJSX, jsxRender } from './qoot.js';
import { helloWorld } from './hello_world.js';

export function serverMain(url: URL, document: Document): void {
  const doc = (
    <html>
      <head>
        <title>Hello World from Server</title>
        <script src="/qootloader.js" async></script>
      </head>
      <body>
        <hello-world url={url.toString()} />
      </body>
    </html>
  );
  const componentMap = {
    "hello-world": helloWorld
  };

  jsxRender(document, document, doc, componentMap);
}