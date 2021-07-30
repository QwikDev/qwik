/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { h } from '@builder.io/qwik';
import {
  renderToString,
  RenderToStringOptions,
  QwikLoader,
  QwikProtocols,
  QwikPrefetch,
} from '@builder.io/qwik/server';
import { ToDoApp } from './ui/TodoApp';

const DEBUG = true;

/**
 * Entry point for server-side pre-rendering.
 *
 * @returns a promise when all of the rendering is completed.
 */
export default function (opts: RenderToStringOptions) {
  return renderToString(
    <html>
      <head>
        <title>ToDo Application</title>
        <link rel="stylesheet" href="./base.css" />
        <link rel="stylesheet" href="./index.css" />
        <QwikProtocols
          protocols={{
            ui: './ui',
            data: './data',
            base: './',
          }}
        />
      </head>
      <body>
        <ToDoApp />
        <QwikLoader events={['click', 'dblclick', 'keyup', 'blur']} debug={DEBUG} />
        {opts.params && Object.prototype.hasOwnProperty.call(opts.params, 'prefetch') ? (
          <QwikPrefetch debug={DEBUG} />
        ) : null}
      </body>
    </html>,
    opts
  );
}
