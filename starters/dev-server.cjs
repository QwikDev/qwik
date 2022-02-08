// DO NOT USE FOR PRODUCTION!!!
// Internal Testing/Dev Server
// DO NOT USE FOR PRODUCTION!!!

const express = require('express');
const { isAbsolute, join, resolve } = require('path');
const {
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  rmdirSync,
  existsSync,
} = require('fs');
const { rollup } = require('rollup');

const { createDocument } = require('@builder.io/qwik-dom');

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
const qwikDistServerPath = join(qwikDistDir, 'server', 'index.mjs');
const qwikDistOptimizerPath = join(qwikDistDir, 'optimizer.cjs');
const qwikDistJsxRuntimePath = join(qwikDistDir, 'jsx-runtime.mjs');
Error.stackTraceLimit = 1000;

// dev server builds ssr's the starter app on-demand (don't do this in production)
async function handleApp(req, res) {
  try {
    const url = new URL(req.url, address);
    const paths = url.pathname.split('/');
    const appName = paths[1];
    const appDir = join(startersAppsDir, appName);
    if (!existsSync(appDir)) {
      return;
    }
    console.log(req.method, req.url, `[${appName} build/ssr]`);

    await buildApp(appDir);
    const html = await ssrApp(req, appName, appDir);

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (e) {
    console.error(e);
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(`❌ ${e.stack || e}`);
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
    input: getSrcInput(appSrcDir),
    plugins: [
      {
        name: 'devNodeRequire',
        transform(code, id) {
          if (id.endsWith('.css')) {
            return `const CSS = ${JSON.stringify(code)}; export default CSS;`;
          }
          return null;
        },
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
        entryStrategy: { type: 'single' },
        srcDir: appSrcDir,
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

async function ssrApp(req, appName, appDir) {
  const buildDir = join(appDir, 'build');
  const serverDir = join(buildDir, 'server');
  const serverPath = join(serverDir, 'entry.server.js');
  const symbolsPath = join(serverDir, 'q-symbols.json');
  const symbols = JSON.parse(readFileSync(symbolsPath, 'utf-8'));

  // require the build's server index (avoiding nodejs require cache)
  const { render } = requireUncached(serverPath);

  // ssr the document
  const result = await render({
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
    console.log(`${address}${appName}/`);
  });
  console.log(``);
});

process.on('SIGTERM', () => server.close());
