// DO NOT USE FOR PRODUCTION!!!
// Internal Testing/Dev Server
// DO NOT USE FOR PRODUCTION!!!
/* eslint-disable no-console */

import express, { Request, Response } from 'express';
import { isAbsolute, join, resolve, dirname } from 'path';
import { readdirSync, statSync, mkdirSync, unlinkSync, rmdirSync, existsSync } from 'fs';
import { Plugin, rollup } from 'rollup';
import type { QwikManifest } from '@builder.io/qwik/optimizer';

const app = express();
const port = parseInt(process.argv[process.argv.length - 1], 10) || 3300;
const address = `http://localhost:${port}/`;
const startersDir = __dirname;
const startersAppsDir = join(startersDir, 'apps');
const appNames = readdirSync(startersAppsDir).filter(
  (p) => statSync(join(startersAppsDir, p)).isDirectory() && p !== 'base'
);

const qwikDistDir = join(__dirname, '..', 'packages', 'qwik', 'dist');
const qwikDistCorePath = join(qwikDistDir, 'core.mjs');
const qwikDistServerPath = join(qwikDistDir, 'server.mjs');
const qwikDistOptimizerPath = join(qwikDistDir, 'optimizer.cjs');
const qwikDistJsxRuntimePath = join(qwikDistDir, 'jsx-runtime.mjs');
Error.stackTraceLimit = 1000;

// dev server builds ssr's the starter app on-demand (don't do this in production)
const cache = new Map<string, QwikManifest>();
async function handleApp(req: Request, res: Response) {
  try {
    const url = new URL(req.url, address);
    const paths = url.pathname.split('/');
    const appName = paths[1];
    const appDir = join(startersAppsDir, appName);

    if (!existsSync(appDir)) {
      res.send(`❌ Invalid dev-server path: ${appDir}`);
      return;
    }

    console.log(req.method, req.url, `[${appName} build/ssr]`);

    let symbols = cache.get(appDir);
    if (!symbols) {
      symbols = await buildApp(appDir);
      cache.set(appDir, symbols!);
    }

    const html = await ssrApp(req, appName, appDir, symbols!);

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (e: any) {
    console.error(e);
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(`❌ ${e.stack || e}`);
  }
}

function devPlugin(): Plugin {
  return {
    name: 'devPlugin',
    resolveId(id, importee) {
      if (id === '@builder.io/qwik') {
        delete require.cache[qwikDistCorePath];
        return qwikDistCorePath;
      }
      if (id === '@builder.io/qwik/server') {
        delete require.cache[qwikDistServerPath];
        return qwikDistServerPath;
      }
      if (id === '@builder.io/qwik/jsx-runtime') {
        delete require.cache[qwikDistJsxRuntimePath];
        return qwikDistJsxRuntimePath;
      }
      if (!id.startsWith('.') && !isAbsolute(id)) {
        return { id, external: true };
      }
      if (importee) {
        const fileId = id.split('?')[0];
        if (fileId.endsWith('.css')) {
          return resolve(dirname(importee), fileId);
        }
      }
      return null;
    },
    transform(code, id) {
      if (id.endsWith('.css')) {
        return `const CSS = ${JSON.stringify(code)}; export default CSS;`;
      }
      return null;
    },
    renderDynamicImport({ targetModuleId }) {
      if (targetModuleId === 'node-fetch') {
        return { left: 'import(', right: ')' };
      }
    },
  };
}

async function buildApp(appDir: string) {
  const optimizer: typeof import('@builder.io/qwik/optimizer') =
    requireUncached(qwikDistOptimizerPath);
  const appSrcDir = join(appDir, 'src');
  const appBuildDir = join(appDir, 'build');
  const appBuildServerDir = join(appBuildDir, 'server');

  // always clean the build directory
  removeDir(appBuildDir);
  mkdirSync(appBuildDir);
  mkdirSync(appBuildServerDir);

  let manifest: QwikManifest | undefined = undefined;

  const clientBuild = await rollup({
    input: getSrcInput(appSrcDir),
    plugins: [
      devPlugin(),
      optimizer.qwikRollup({
        srcDir: appSrcDir,
        entryStrategy: { type: 'single' },
        manifestOutput: (m) => {
          manifest = m;
        },
      }),
    ],
  });
  await clientBuild.write({
    dir: appBuildDir,
  });

  const ssrBuild = await rollup({
    input: getSrcInput(appSrcDir),
    plugins: [
      devPlugin(),
      optimizer.qwikRollup({
        buildMode: 'ssr',
        srcDir: appSrcDir,
        entryStrategy: { type: 'single' },
        manifestInput: manifest,
      }),
    ],
  });
  await ssrBuild.write({
    dir: appBuildServerDir,
  });

  return manifest;
}

function getSrcInput(appSrcDir: string) {
  // get all the entry points for tsx for DEV ONLY!
  const srcInputs: string[] = [];

  function readDir(dir: string) {
    const items = readdirSync(dir);
    for (const item of items) {
      const itemPath = join(dir, item);
      const s = statSync(itemPath);
      if (s.isDirectory()) {
        readDir(itemPath);
      } else if (item.endsWith('.tsx')) {
        srcInputs.push(itemPath);
      }
    }
  }
  readDir(appSrcDir);

  return srcInputs;
}

function removeDir(dir: string) {
  try {
    const items = readdirSync(dir);
    const itemPaths = items.map((i) => join(dir, i));
    itemPaths.forEach((itemPath) => {
      if (statSync(itemPath).isDirectory()) {
        removeDir(itemPath);
      } else {
        unlinkSync(itemPath);
      }
    });
    rmdirSync(dir);
  } catch (e) {
    /**/
  }
}

async function ssrApp(req: Request, appName: string, appDir: string, manifest: QwikManifest) {
  const buildDir = join(appDir, 'build');
  const serverDir = join(buildDir, 'server');
  const serverPath = join(serverDir, 'entry.server.js');

  // require the build's server index (avoiding nodejs require cache)
  const { render } = requireUncached(serverPath);

  // ssr the document
  const base = `/${appName}/build/`;
  console.log('req.url', req.url);
  const result = await render({
    manifest,
    url: new URL(`${req.protocol}://${req.hostname}${req.url}`),
    debug: true,
    base: base,
  });

  return result.html;
}

function requireUncached(module: string) {
  delete require.cache[require.resolve(module)];
  return require(module);
}

function startersHomepage(_: Request, res: Response) {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
  <html>
    <head>
      <title>Starters Dev Server</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif, Apple Color Emoji, Segoe UI Emoji;
          line-height: 1.5;
        }
        a { color: #4340C4; }
        a:hover { text-decoration: none; }
        h1 { margin: 5px 0; }
      </style>
    </head>
    <body>
      <h1>⚡️ Starters Dev Server ⚡️</h1>
      <ul>
        ${appNames.map((a) => `<li><a href="/${a}/">${a}</a></li>`).join('')}
      </ul>
    </body>
  </html>
  `);
}

function favicon(_: Request, res: Response) {
  const path = join(startersAppsDir, 'base', 'public', 'favicon.ico');
  res.sendFile(path);
}

const partytownPath = resolve(startersDir, '..', 'node_modules', '@builder.io', 'partytown', 'lib');
app.use(`/~partytown`, express.static(partytownPath));

appNames.forEach((appName) => {
  const buildPath = join(startersAppsDir, appName, 'build');
  app.use(`/${appName}/build`, express.static(buildPath));

  const publicPath = join(startersAppsDir, appName, 'public');
  app.use(`/${appName}`, express.static(publicPath));
});

app.get('/', startersHomepage);
app.get('/favicon.ico', favicon);
app.get('/*', handleApp);

const server = app.listen(port, () => {
  console.log(`Starter Dir: ${startersDir}`);
  console.log(`Dev Server: ${address}\n`);

  console.log(`Starters:`);
  appNames.forEach((appName) => {
    console.log(`  ${address}${appName}/`);
  });
  console.log(``);
});

process.on('SIGTERM', () => server.close());
