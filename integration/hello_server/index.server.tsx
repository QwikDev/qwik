/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { h } from '@builder.io/qwik';
import { renderToString, RenderToStringOptions, QwikLoader } from '@builder.io/qwik/server';

import { Greeter } from './Greeter';

/**
 * Entry point for server-side pre-rendering.
 *
 * @returns a promise when all of the rendering is completed.
 */
export default function (opts: RenderToStringOptions) {
  return renderToString(
    <html>
      <head>
        <title>Hello World from Server</title>
      </head>
      <body>
        <Greeter name="World" />
        <QwikLoader debug={true} />
      </body>
    </html>,
    opts
  );
}
