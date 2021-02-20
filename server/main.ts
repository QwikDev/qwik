/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import commander from 'commander';
import domino from 'domino';
import express from 'express';
import * as fs from 'fs';
import { dirname, join } from 'path';
import srcMap from 'source-map-support';
import { fileURLToPath } from 'url';

import { findFiles } from './fs_util.js';

srcMap.install();

async function main(__dirname: string, process: NodeJS.Process) {
  console.log('===================================================');
  console.log('Starting:', __dirname);
  console.log('Node Version:', process.version);

  const program = commander.program;
  program
    .version('0.0.1')
    .option('-p --port <port>', 'HTTP port to serve from', parseInt, 8080)
    .option('-r --root <path...>', 'List of roots to serve from', [] as any);

  program.parse(process.argv);
  const opts: { port: number; root: string[] } = program.opts() as any;
  console.log(opts);
  var app = (express as any)();

  const RUNFILES: string = process.env.RUNFILES || '';
  console.log('RUNFILES', RUNFILES);

  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.endsWith('/qoot.js') && req.path !== '/qoot.js') {
      res.type('application/javascript');
      res.write("export * from '/qoot.js';");
      res.end();
    } else {
      next();
    }
  });

  // Set up static routes first
  const servePaths = opts.root.map((servePath: string) => join(RUNFILES, servePath));

  servePaths.forEach((path: string) => {
    if (fs.existsSync(path)) {
      console.log('Serve static:', path);
      app.use('/', express.static(path));
    } else {
      console.log('REJECTING:', path);
    }
  });

  const serverIndexJS: { url: string; path: string }[] = [];
  opts.root.forEach((root) => {
    findFiles(
      join(RUNFILES, root),
      'server_index.js',
      (fullPath: string, fileName: string, relativePath: string) => {
        console.log('Found: ', fileName, relativePath, fullPath);
        serverIndexJS.push({ url: relativePath, path: fullPath });
      }
    );
  });

  // Now search for `server.js`
  await Promise.all(
    serverIndexJS.map(async (indexJS) => {
      console.log('Importing: ', indexJS.path);
      const serverMain = (await import(indexJS.path)).serverMain;
      app.use('/' + indexJS.url, createServerJSHandler(serverMain));
    })
  );

  app.listen(opts.port);
}

function createServerJSHandler(serverMain: Function) {
  return function serverJSHandler(req: any, res: any) {
    const document = domino.createDocument();
    serverMain(req.url, document);
    const html = document.querySelector('html');
    res.send(html ? html.outerHTML : '');
  };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
main(__dirname, process).then(() => {
  console.log('Serving ...');
});
