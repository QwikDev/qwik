/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
import { renderToString, RenderToStringOptions, QwikLoader } from '@builder.io/qwik/server';
import { App } from './components/app/app';
import type { Todos } from './state/state';

/**
 * Entry point for server-side pre-rendering.
 *
 * @returns a promise when all of the rendering is completed.
 */
export function render(opts: RenderToStringOptions) {
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
        <meta charSet="utf-8" />
        <title>Qwik Demo: ToDo</title>
        <link rel="stylesheet" href="/base.css" />
        <link rel="stylesheet" href="/index.css" />
      </head>
      <body q:base="/">
        <App todos={todos} />
        <QwikLoader debug={opts.debug} />
      </body>
    </html>,
    opts
  );
}
