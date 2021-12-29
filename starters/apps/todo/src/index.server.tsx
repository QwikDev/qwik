/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { h } from '@builder.io/qwik';
import { renderToString, RenderToStringOptions, QwikLoader } from '@builder.io/qwik/server';
import { ToDoApp } from './components';
import type { Todos } from './state';

/**
 * Entry point for server-side pre-rendering.
 *
 * @returns a promise when all of the rendering is completed.
 */
export function renderApp(opts: RenderToStringOptions) {
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
        <title>Qwik Demo: ToDo</title>
        <link rel="stylesheet" href="/base.css" />
        <link rel="stylesheet" href="/index.css" />
      </head>
      <body q:base="/build/">
        <ToDoApp todos={todos} />
        <QwikLoader debug={opts.debug} />
      </body>
    </html>,
    opts
  );
}
