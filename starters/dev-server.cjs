// DO NOT USE FOR PRODUCTION!!!
// Internal Testing/Dev Server
// DO NOT USE FOR PRODUCTION!!!

const express = require('express');
const { isAbsolute, join, resolve, dirname } = require('path');
const { readdirSync, statSync, mkdirSync, unlinkSync, rmdirSync, existsSync } = require('fs');
const { rollup } = require('rollup');

const app = express();
const port = parseInt(process.argv[process.argv.length - 1], 10) || 3300;
const address = `http://localhost:${port}/`;
const startersDir = __dirname;
const startersAppsDir = join(startersDir, 'apps');
const appNames = readdirSync(startersAppsDir).filter(
  (p) => statSync(join(startersAppsDir, p)).isDirectory() && p !== 'base'
);

const qwikDistDir = join(__dirname, '..', 'dist-dev', '@builder.io-qwik');
const qwikDistCorePath = join(qwikDistDir, 'core.mjs');
const qwikDistServerPath = join(qwikDistDir, 'server.mjs');
const qwikDistOptimizerPath = join(qwikDistDir, 'optimizer.cjs');
const qwikDistJsxRuntimePath = join(qwikDistDir, 'jsx-runtime.mjs');
Error.stackTraceLimit = 1000;

// dev server builds ssr's the starter app on-demand (don't do this in production)
const cache = new Map();
async function handleApp(req, res) {
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
      cache.set(appDir, symbols);
    }

    const html = await ssrApp(req, appName, appDir, symbols);

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (e) {
    console.error(e);
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(`❌ ${e.stack || e}`);
  }
}

function devPlugin() {
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

async function buildApp(appDir) {
  const optimizer = requireUncached(qwikDistOptimizerPath);
  const appSrcDir = join(appDir, 'src');
  const appBuildDir = join(appDir, 'build');
  const appBuildServerDir = join(appBuildDir, 'server');

  // always clean the build directory
  removeDir(appBuildDir);
  mkdirSync(appBuildDir);
  mkdirSync(appBuildServerDir);

  let symbols = null;

  const clientBuild = await rollup({
    input: getSrcInput(appSrcDir),
    plugins: [
      devPlugin(),
      optimizer.qwikRollup({
        buildMode: 'client',
        srcDir: appSrcDir,
        entryStrategy: { type: 'single' },
        symbolsOutput: (clientSymbols) => {
          symbols = clientSymbols;
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
        symbolsInput: symbols,
      }),
    ],
  });
  await ssrBuild.write({
    dir: appBuildServerDir,
  });

  return symbols;
}

function getSrcInput(appSrcDir) {
  // get all the entry points for tsx for DEV ONLY!
  const srcInputs = [];

  function readDir(dir) {
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

function removeDir(dir) {
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
  } catch (e) {}
}

async function ssrApp(req, appName, appDir, symbols) {
  const buildDir = join(appDir, 'build');
  const serverDir = join(buildDir, 'server');
  const serverPath = join(serverDir, 'entry.server.js');

  // require the build's server index (avoiding nodejs require cache)
  const { render } = requireUncached(serverPath);

  // ssr the document
  const result = await render({
    symbols,
    url: new URL(`${req.protocol}://${req.hostname}${req.url}`),
    debug: true,
    base: `/${appName}/build/`,
  });

  return result.html;
}

function requireUncached(module) {
  delete require.cache[require.resolve(module)];
  return require(module);
}

function startersHomepage(_, res) {
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

function favicon(_, res) {
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
