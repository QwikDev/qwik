// Internal Testing/Dev Server
// DO NO USE FOR PRODUCTION!!!

const express = require('express');
const { join } = require('path');
const {
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
} = require('fs');
const { rollup } = require('rollup');

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

// dev server builds ssr's the starter app on-demand (don't do this in production)
async function handleApp(req, res) {
  try {
    const url = new URL(req.url, address);
    const paths = url.pathname.split('/');
    const appName = paths[1];
    const lastPath = paths[paths.length - 1];
    const appDir = join(startersAppsDir, appName);

    if (lastPath !== '') {
      return staticPublicFile(req, res);
    }

    console.log(req.method, req.url, `[${appName} build/ssr]`);

    await buildApp(appDir);
    const html = await ssrApp(req, appDir);

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

  rmSync(appBuildDir, { force: true, recursive: true });
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
          if (!id.startsWith('.') && !id.startsWith('/')) {
            return { id, external: true };
          }
          return null;
        },
      },
      optimizer.qwikRollup({
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

async function ssrApp(req, appDir) {
  const buildDir = join(appDir, 'build');
  const serverDir = join(buildDir, 'server');
  const serverPath = join(serverDir, 'index.server.js');
  const symbolsPath = join(serverDir, 'q-symbols.json');

  const { renderApp } = requireUncached(serverPath);

  const result = await renderApp({
    symbols: JSON.parse(readFileSync(symbolsPath, 'utf-8')),
    url: new URL(`${req.protocol}://${req.hostname}${req.url}`),
    debug: true,
  });

  return result.html;
}

function staticPublicFile(req, res) {
  try {
    const paths = req.url.split('/').filter((p) => p.length);

    for (const appName of appNames) {
      const path = join(startersAppsDir, appName, 'public', ...paths);
      if (existsSync(path)) {
        console.log(req.method, req.url, `[${appName} static]`);
        res.sendFile(path);
        return;
      }
    }
  } catch (e) {
    res.status(500).send(String(e.stack || e));
    return;
  }

  res.status(404).send(`404: ${req.url}`);
}

function startersHomepage(req, res) {
  res.set('Content-Type', 'text/html');
  res.send(`
  <html>
    <head>
      <title>Starters Dev Server</title>
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

appNames.forEach((appName) => {
  const buildPath = join(startersAppsDir, appName, 'build');
  app.use(`/${appName}/build`, express.static(buildPath));
});

app.get('/', startersHomepage);
app.get('/*', handleApp);

app.listen(port, () => {
  console.log(`Starter Dir: ${startersDir}`);
  console.log(`Dev Server: ${address}\n`);

  console.log(`Starters:`);
  appNames.forEach((appName) => {
    console.log(`${address}${appName}/`);
  });
  console.log(``);
});

function requireUncached(module) {
  delete require.cache[require.resolve(module)];
  return require(module);
}

function emptyDir(dir) {
  try {
    mkdirSync(appBuildServerDir, { recursive: true });
  } catch (e) {}
}
