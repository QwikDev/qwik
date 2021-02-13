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
import {dirname, join} from 'path';
import {fileURLToPath} from 'url';


async function main(__dirname: string, process: NodeJS.Process) {
  console.log('===================================================');
  console.log('Starting:', __dirname);
  console.log('Node Version:', process.version);

  const program = commander.program;
  program.version('0.0.1')
      .option('-p --port <port>', 'HTTP port to serve from', parseInt, 8080)
      .option('-r --root <path...>', 'List of roots to serve from', [] as any);

  program.parse(process.argv);
  const opts: {port: number, root: string[]} = program.opts() as any;
  console.log(opts);
  var app = (express as any)();

  const basePath = dirname(__dirname.split('.runfiles/')[0]);
  // Set up static routes first
  const servePaths =
      opts.root.map((servePath: string) => join(basePath, servePath));
  servePaths.forEach((path: string) => {
    if (fs.existsSync(path)) {
      console.log('Serve static:', path);
      app.use('/', express.static(path));
    } else {
      console.log('REJECTING:', path);
    }
  });
  // Now search for `server.js`
  await Promise.all(servePaths.map(async (fullPath: string) => {
    const serverJS = join(fullPath, 'server.js');
    if (fs.existsSync(serverJS)) {
      console.log('   Found:', serverJS);
      const serverMain = (await import(serverJS)).serverMain;
      app.use('/', createServerJSHandler(serverMain));
    }
  }));
  app.listen(opts.port);
}

function createServerJSHandler(serverMain: Function) {
  return function serverJSHandler(req: any, res: any) {
    const document = domino.createDocument();
    serverMain(req.url, document);
    const qScript = document.createElement('script');
    qScript.src = '/qootloader.js';
    qScript.defer = true;
    const html = document.querySelector('html')!;
    const head = html.querySelector('head')!;
    head.appendChild(qScript);
    res.send(html.outerHTML);
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
main(__dirname, process).then(() => {
  console.log('Serving ...');
})