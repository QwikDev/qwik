/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */
/* eslint no-console: ["off"] */
import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import { join } from 'path';
import {
  createEsbuilder,
  createClientEsbuildOptions,
  createServerEsbuildOptions,
  createTimer,
  getQwikLoaderScript,
  Optimizer,
  OutputFile,
  writeOutput,
} from '@builder.io/qwik/optimizer';
import type { BuildOptions } from 'esbuild';
import type { RenderToStringResult } from '@builder.io/qwik/server';
import mri from 'mri';
import srcMap from 'source-map-support';
srcMap.install();

/**
 * Verbose dev-server tooling built specifically for inspecting/debugging this local
 * project's source files. Standard qwik development would not have most of this.
 */
async function startServer() {
  const args = mri(process.argv.slice(2), {
    default: { port: 8080, mode: 'development' },
  });

  const rootDir = __dirname;
  const qwikDir = join(rootDir, '..', 'dist-dev', '@builder.io-qwik');
  const outDir = join(rootDir, 'out');
  const mode = args.mode === 'production' ? 'production' : 'development';
  const debug = mode === 'development';

  console.log('====================================================');
  console.log(`Integration Server`);
  console.log(`Mode:                ${mode}`);
  console.log(`Integration Dir:     ${rootDir}`);
  console.log(`Serverside Out Dir:  ${outDir}`);
  console.log(`Qwik Dir:            ${qwikDir}`);
  console.log(`Server:              http://localhost:${args.port}/`);
  console.log(``);

  const optimizer = new Optimizer({ rootDir, mode });

  const clientOpts = await createClientEsbuildOptions(optimizer);
  const serverOpts = await createServerEsbuildOptions(optimizer);
  localDevPreBuild(qwikDir, clientOpts, serverOpts);

  const esbuilder = createEsbuilder({
    outDir,
    clientOpts,
    serverOpts,
  });

  /**
   * On-demand source file transpiler and server-side rendering for development only.
   * Http requests will kick-off the build, write to disk, and respond with the SSR build.
   * Generated files are written to a gitignored directory so it can be inspected/debugged.
   */
  async function devSsr(req: Request, res: Response, next: NextFunction) {
    if (req.path.endsWith('/')) {
      const build = await esbuilder.build();
      if (build.diagnosticsSummary) {
        res.type('text/plain');
        res.send(build.diagnosticsSummary);
        return;
      }

      localDevPostBuild(qwikDir, build.outputFiles);

      const moduleFile = build.outputFiles.find((f) => {
        const indexServerPath = req.path.substr(1) + 'index.server.js';
        return f.path === indexServerPath;
      });
      if (moduleFile) {
        try {
          const indexServerPath = join(outDir, moduleFile.path);
          if (debug) console.debug(`server:`, req.originalUrl, indexServerPath);

          // write the serverside cjs build to disk so local require() and debugging works
          const writeTime = createTimer();
          await writeOutput({
            dir: outDir,
            files: build.outputFiles.filter((o) => o.platform === 'server'),
            emptyDir: true,
          });
          const devBuildWrite = writeTime();

          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const indexModule = require(indexServerPath);

          const result: RenderToStringResult = await indexModule.default({
            url: req.originalUrl,
            outDir,
          });

          const serverTiming = {
            devBuildClient: build.timers.clientBuild,
            devBuildServer: build.timers.serverBuild,
            devBuildTotal: build.timers.totalBuild,
            devBuildWrite: devBuildWrite,
            ...result.timing,
          };

          res.set(
            'Server-Timing',
            Object.keys(serverTiming)
              .map((k) => `${k};dur=${(serverTiming as any)[k]}`)
              .join(',')
          );

          res.type('text/html');
          res.send(result.html);
        } catch (e) {
          console.error(e);
          res.type('text/plain');
          res.send(String(e.stack || e));
        }
        return;
      }
    }
    next();
  }

  /**
   * On-demand source file transpiler for development only. Files are not written to disk.
   * Http requests will kick-off the build and respond with in-memory client-side build results.
   */
  async function devModules(req: Request, res: Response, next: NextFunction) {
    if (req.path.endsWith('.js')) {
      const fileName = req.path.substr(1);
      const result = await esbuilder.build();
      if (result.diagnostics.length > 0) {
        res.send(result.diagnostics.map((d) => d.message).join('\n\n'));
        res.type('text/plain');
        return;
      }
      const outJs = result.outputFiles.find(
        (o) => o.platform === 'client' && o.path.endsWith(fileName)
      );
      if (outJs) {
        if (debug) console.debug(`client:`, req.originalUrl);
        res.type('application/javascript');
        res.send(outJs.text);
        return;
      }
    }
    next();
  }

  const app = express();
  app.get('/qwikloader.js', (req, res) => {
    res.type('application/javascript');
    res.send(getQwikLoaderScript({ debug }));
  });
  app.use(devSsr);
  app.use(devModules);
  app.use(express.static(rootDir));
  let server = app.listen(args.port);

  function close() {
    if (server) {
      server.close(() => {
        if (debug) console.debug(`\nclosed dev server ${args.port}\n`);
      });
      server = null as any;
    }
  }
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
}

// custom updates only required for local dev of source files

function localDevPreBuild(qwikDir: string, clientOpts: BuildOptions, serverOpts: BuildOptions) {
  clientOpts.plugins = [
    ...clientOpts.plugins!,
    {
      name: 'qwikDevClient',
      setup(build) {
        // for local repo testing only
        build.onResolve({ filter: /^@builder\.io\/qwik$/ }, () => ({
          path: join(qwikDir, 'core.mjs'),
        }));
      },
    },
  ];

  const removeDevServer = (entryPoints: any) => {
    if (Array.isArray(entryPoints)) {
      return entryPoints.filter((f) => !f.includes('devserver'));
    }
    return entryPoints;
  };

  clientOpts.entryPoints = removeDevServer(clientOpts?.entryPoints);
  serverOpts.entryPoints = removeDevServer(serverOpts?.entryPoints);
}

function localDevPostBuild(qwikDir: string, outputFiles: OutputFile[]) {
  outputFiles.forEach((f) => {
    // for local repo testing only
    f.text = f.text.replace(/@builder\.io\/qwik\/server/g, qwikDir + '/server/index.cjs');
    f.text = f.text.replace(/@builder\.io\/qwik/g, qwikDir + '/core.cjs');
  });
}

startServer();
