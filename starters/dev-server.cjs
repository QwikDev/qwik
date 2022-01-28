// Internal Testing/Dev Server
// DO NO USE FOR PRODUCTION!!!

const express = require('express');
const { isAbsolute, join } = require('path');
const {
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  rmdirSync,
} = require('fs');
const { rollup } = require('rollup');
const { createDocument } = require('domino');

const app = express();
const port = parseInt(process.argv[process.argv.length - 1], 10) || 3300;
const address = `http://localhost:${port}/`;
const startersDir = __dirname;
const startersAppsDir = join(startersDir, 'apps');
const appNames = readdirSync(startersAppsDir).filter((p) =>
  statSync(join(startersAppsDir, p)).isDirectory()
);

const qwikDistDir = join(__dirname, '..', 'dist-dev', '@builder.io-qwik');
const qwikDistCorePath = join(qwikDistDir, 'core.mjs');
const qwikDistServerPath = join(qwikDistDir, 'server', 'index.mjs');
const qwikDistOptimizerPath = join(qwikDistDir, 'optimizer.cjs');
const qwikDistJsxRuntimePath = join(qwikDistDir, 'jsx-runtime.mjs');

// dev server builds ssr's the starter app on-demand (don't do this in production)
async function handleApp(req, res) {
  try {
    const url = new URL(req.url, address);
    const paths = url.pathname.split('/');
    const appName = paths[1];
    const appDir = join(startersAppsDir, appName);

    console.log(req.method, req.url, `[${appName} build/ssr]`);

    await buildApp(appDir);
    const html = await ssrApp(req, appName, appDir);

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (e) {
    console.error(e);
    res.send(String(e.stack || e));
  }
}

async function buildApp(appDir) {
  const optimizer = requireUncached(qwikDistOptimizerPath);
  const appSrcDir = join(appDir, 'src');
  const appBuildDir = join(appDir, 'build');
  const appBuildServerDir = join(appBuildDir, 'server');
  const symbolsPath = join(appBuildServerDir, 'q-symbols.json');

  // always clean the build directory
  removeDir(appBuildDir);
  mkdirSync(appBuildDir);
  mkdirSync(appBuildServerDir);

  const rollupInputOpts = {
    input: readdirSync(appSrcDir)
      .filter((f) => f.endsWith('.tsx'))
      .map((f) => join(appSrcDir, f)),
    plugins: [
      {
        name: 'devNodeRequire',
        resolveId(id) {
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
          return null;
        },
      },
      optimizer.qwikRollup({
        entryStrategy: { type: 'hook' },
        symbolsOutput: (data) => {
          writeFileSync(symbolsPath, JSON.stringify(data, null, 2));
        },
      }),
    ],
  };

  const rollupBuild = await rollup(rollupInputOpts);

  await rollupBuild.write({
    chunkFileNames: 'q-[name]-[hash].js',
    dir: appBuildDir,
    format: 'es',
  });

  await rollupBuild.write({
    dir: appBuildServerDir,
    format: 'cjs',
  });
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

async function ssrApp(req, appName, appDir) {
  const buildDir = join(appDir, 'build');
  const serverDir = join(buildDir, 'server');
  const serverPath = join(serverDir, 'index.server.js');
  const symbolsPath = join(serverDir, 'q-symbols.json');
  const symbols = JSON.parse(readFileSync(symbolsPath, 'utf-8'));

  // require the build's server index (avoiding nodejs require cache)
  const { renderApp } = requireUncached(serverPath);

  // ssr the document
  const result = await renderApp({
    symbols,
    url: new URL(`${req.protocol}://${req.hostname}${req.url}`),
    debug: true,
  });

  // modify the ssr'd document so we can update the paths only for this
  // local testing dev server (we don't need to do this for actual starters)
  const doc = createDocument(result.html);
  doc.body.setAttribute('q:base', `/${appName}/build/`);
  const hrefElms = Array.from(doc.querySelectorAll('[href]'));
  hrefElms.forEach((hrefElm) => {
    const href = hrefElm.getAttribute('href') || '';
    if (href.startsWith('/')) {
      hrefElm.setAttribute('href', `/${appName}${href}`);
    }
  });
  return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
}

function requireUncached(module) {
  delete require.cache[require.resolve(module)];
  return require(module);
}

function startersHomepage(req, res) {
  res.set('Content-Type', 'text/html');
  res.send(`
  <html>
    <head>
      <title>Starters Dev Server</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif, Apple Color Emoji, Segoe UI Emoji;
          line-height: 1.5;
        }
        a {
          color: #4340C4;
        }
        a:hover {
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <h1>Starters Dev Server</h1>
      <ul>
        ${appNames.map((a) => `<li><a href="/${a}/">${a}</a></li>`).join('')}
      </ul>
    </body>
  </html>
  `);
}

function favicon(req, res) {
  const path = join(startersAppsDir, 'todo', 'public', 'favicon.ico');
  res.sendFile(path);
}

const partytownPath = join(startersDir, '..', 'node_modules', '@builder.io', 'partytown', 'lib');
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
    console.log(`${address}${appName}/`);
  });
  console.log(``);
});

process.on('SIGTERM', () => server.close());
