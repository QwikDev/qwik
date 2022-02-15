/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
import { renderToString, RenderToStringOptions, QwikLoader } from '@builder.io/qwik/server';
import { App } from './main';

/**
 * Entry point for server-side pre-rendering.
 *
 * @returns a promise when all of the rendering is completed.
 */
export function render(opts: RenderToStringOptions) {
  return renderToString(
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>Qwik Demo: ToDo</title>
      </head>
      <body q:base="/">
        <App />
        <QwikLoader debug={opts.debug} />
      </body>
    </html>,
    opts
  );
}
