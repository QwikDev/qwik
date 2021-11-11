/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { h } from '@builder.io/qwik';
import { renderToString, RenderToStringOptions, QwikLoader } from '@builder.io/qwik/server';
import { ToDoApp } from './components.qwik';
import type { Todos } from './state.qwik';

/**
 * Entry point for server-side pre-rendering.
 *
 * @returns a promise when all of the rendering is completed.
 */
function serverRender(opts: RenderToStringOptions) {
  const todos: Todos = {
    filter: 'all',
    items: [
      { completed: false, title: 'Read Qwik docs' },
      { completed: false, title: 'Build HelloWorld' },
      { completed: false, title: 'Profit' },
    ],
  };

  return renderToString(
    <html>
      <head>
        <title>Hello World from Server</title>
      </head>
      <body>
        <ToDoApp todos={todos} />
        <QwikLoader debug={true} />
      </body>
    </html>,
    opts
  );
}

serverRender({
  outDir: './',
}).then((str) => {
  // eslint-disable-next-line no-console
  console.log(str.html);
});
