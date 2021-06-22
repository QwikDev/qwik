/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { jsxFactory, jsxRender } from './qwik.js';
import { Greeter } from './Greeter.js';

export const _needed_by_JSX_ = jsxFactory; // eslint-disable-line @typescript-eslint/no-unused-vars

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
        <script src="/qwikloader.js" async></script>
      </head>
      <body>
        <Greeter name="World" />
      </body>
    </html>
  );
  return jsxRender(document, doc, document);
}
