/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import './CONFIG.js';
import { jsxFactory, jsxRender } from './qoot.js';
import { Greeter } from './Greeter/public.js';

/**
 * Entry point for server-side pre-rendering.
 *
 * @param document
 * @returns a promise when all of the rendering is completed.
 */
export async function serverMain(document: Document) {
  const doc = (
    <html>
      <head>
        <title>Hello World from Server</title>
        <script src="/qootloader.js" async></script>
      </head>
      <body>
        <Greeter name="World" />
      </body>
    </html>
  );
  return jsxRender(document, doc, document);
}
