/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { h } from '@builder.io/qwik';
import { renderToString, RenderToStringOptions, QwikLoader } from '@builder.io/qwik/server';
import { MyApp } from './my-app.qwik';

/**
 * Entry point for server-side pre-rendering.
 *
 * @returns a promise when all of the rendering is completed.
 */
export default function serverRender(opts: RenderToStringOptions) {
  return renderToString(
    <html>
      <head>
        <title>Qwik Blank App</title>
      </head>
      <body>
        <MyApp />
        <QwikLoader debug={opts.debug} />
      </body>
    </html>,
    opts
  );
}
