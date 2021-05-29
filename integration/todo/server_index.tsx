/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import './CONFIG.js';
import { jsxFactory, jsxRender } from './qwik.js';
import { ToDoApp } from './ui/TodoApp.js';

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
        <title>ToDo Application</title>
        <script src="/qwikloader.min.js" type="module" events="click;dblclick;keyup;blur"></script>
        <script>{"var Q={protocol:{ui:'./ui',data:'./data',base:'./'}}"}</script>
        <link rel="stylesheet" href="./base.css" />
        <link rel="stylesheet" href="./index.css" />
      </head>
      <body>
        <ToDoApp />
      </body>
    </html>
  );
  return jsxRender(document, doc, document);
}
