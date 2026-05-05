// DO NOT USE FOR PRODUCTION!!!
// Internal Testing/Dev Server
// DO NOT USE FOR PRODUCTION!!!

/* eslint-disable no-console */

import type { QwikManifest } from '@qwik.dev/core/optimizer';
import type { Render, RenderToStreamOptions } from '@qwik.dev/core/server';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, type InlineConfig, type PluginOption } from 'vite';
import type { PackageJSON } from '../../scripts/types.ts';

const isWindows = process.platform === 'win32';

// map the file path to a url for windows only
const file = (filePath: string) => {
  return isWindows ? pathToFileURL(filePath).toString() : filePath;
};

// Escape path for imports in windows
const escapeChars = (filePath: string) => {
  return isWindows ? filePath.replace(/\\/g, '\\\\') : filePath;
};

// Parse command line arguments
let buildTarget: string | undefined;
let port = 3300;

for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg.startsWith('--build=')) {
    buildTarget = arg.substring('--build='.length);
  } else if (arg === '--build' && i + 1 < process.argv.length) {
    buildTarget = process.argv[++i];
  } else {
    const portNum = parseInt(arg, 10);
    if (!isNaN(portNum)) {
      port = portNum;
    }
  }
}

const app = express();
const address = `http://localhost:${port}/`;
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const e2eDir = __dirname;
const repoRoot = resolve(__dirname, '..', '..');
const appsDir = join(e2eDir, 'apps');
const appNames = readdirSync(appsDir).filter((p) => statSync(join(appsDir, p)).isDirectory());

type OOOSReleaseStore = {
  resolved: Set<string>;
  resolvers: Map<string, Set<() => void>>;
};

const getOOOSReleaseStore = (): OOOSReleaseStore =>
  ((globalThis as any).__qwikOOOSReleaseStore ||= {
    resolved: new Set<string>(),
    resolvers: new Map<string, Set<() => void>>(),
  });

const getOOOSReleaseKey = (requestId: string, releaseId: string): string => {
  return `${requestId}:${releaseId}`;
};

let ooosRequestCounter = 0;

/** Used when qwik-router server is enabled */
const qwikRouterVirtualEntry = '@router-ssr-entry';
const entrySsrFileName = 'entry.ssr.tsx';

Error.stackTraceLimit = 1000;

// dev server builds ssr's the starter app on-demand (don't do this in production)
const cache = new Map<string, Promise<QwikManifest>>();
async function handleApp(req: Request, res: Response, next: NextFunction) {
  try {
    let url;
    try {
      url = new URL(req.url, address);
    } catch {
      res.status(404).send();
      return;
    }
    if (existsSync(url.pathname)) {
      const relPath = relative(appsDir, url.pathname);
      if (!relPath.startsWith('.')) {
        url.pathname = relPath;
      }
    }
    const paths = url.pathname.split('/');
    const appName = paths[1];
    const appDir = join(appsDir, appName);
    if (!existsSync(appDir)) {
      res.status(404).send(`❌ Invalid dev-server path: ${appDir}`);
      return;
    }

    console.log(req.method, req.url, `[${appName} build/ssr]`);

    const pkgPath = join(appDir, 'package.json');
    const pkgJson: PackageJSON = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const enableRouterServer = !!pkgJson.__qwik__?.qwikRouter;

    let clientManifest = cache.get(appDir);
    if (!clientManifest) {
      clientManifest = buildApp(appDir, appName, enableRouterServer);
      cache.set(appDir, clientManifest);
    }

    const resolved = await clientManifest;
    if (url.pathname.endsWith('.js')) {
      res.set('Content-Type', 'text/javascript');
    } else {
      res.set('Content-Type', 'text/html');
    }
    if (enableRouterServer) {
      await routerApp(req, res, next, appDir);
    } else {
      await ssrApp(req, res, appName, appDir, resolved);
      res.end();
    }
  } catch (e: any) {
    console.error(e);
    if (!res.headersSent) {
      res.set('Content-Type', 'text/plain; charset=utf-8');
      res.send(`❌ ${e.stack || e}`);
    }
  }
}

async function buildApp(appDir: string, appName: string, enableRouterServer: boolean) {
  const optimizer = await import('@qwik.dev/core/optimizer');
  const appSrcDir = join(appDir, 'src');
  const appDistDir = join(appDir, 'dist');
  const appServerDir = join(appDir, 'server');
  const basePath = `/${appName}/`;
  const isProd = appName.includes('.prod');

  // always clean the build directory
  removeDir(appDistDir);
  removeDir(appServerDir);

  let clientManifest: QwikManifest | undefined = undefined;
  const plugins: PluginOption[] = [];
  if (enableRouterServer) {
    // ssr entry existed in service folder, use dev plugin to
    // 1. export router
    // 2. set basePath
    plugins.push({
      name: 'devPlugin',
      resolveId(id) {
        if (id.endsWith(qwikRouterVirtualEntry)) {
          return qwikRouterVirtualEntry;
        }
      },
      load(id) {
        if (id.endsWith(qwikRouterVirtualEntry)) {
          return `import { createQwikRouter } from '@qwik.dev/router/middleware/node';
import render from '${escapeChars(resolve(appSrcDir, 'entry.ssr'))}';
const { router } = createQwikRouter({
  render,
  base: '${basePath}build/',
});
export { router }
`;
        }
      },
    });
    const qwikRouterVite = await import('@qwik.dev/router/vite');
    // TODO when you add this, vite-imagetools images no longer become assets!!! (they still get emitted, but don't show up in the build)
    // const qwikRouterSsg = await import(
    //   "@qwik.dev/router/adapters/node-server/vite"
    // );

    plugins.push(
      qwikRouterVite.qwikRouter({
        rewriteRoutes: [
          {
            paths: {
              projects: 'projekte',
            },
          },
        ],
      }) as PluginOption
      // qwikRouterSsg.nodeServerAdapter({
      //   ssg: null,
      // }) as PluginOption,
    );
  }

  const getInlineConf = (extra?: InlineConfig): InlineConfig => ({
    root: appDir,
    mode: isProd ? 'production' : 'development',
    configFile: false,
    base: basePath,
    ...extra,
    resolve: {
      conditions: [isProd ? 'production' : 'development'],
      mainFields: [],
    },
  });

  await build(
    getInlineConf({
      build: {
        minify: false,
      },
      define: {
        'globalThis.qDev': !isProd,
        'globalThis.qInspector': false,
        'globalThis.PORT': port,
      },
      plugins: [
        ...plugins,
        optimizer.qwikVite({
          entryStrategy: { type: 'segment' },
          client: {
            outDir: join(appDistDir, appName),
            manifestOutput(manifest) {
              clientManifest = manifest;
            },
          },
          experimental: ['each', 'suspense', 'preventNavigate', 'enableRequestRewrite'],
        }),
      ],
    })
  );

  await build(
    getInlineConf({
      build: {
        emitAssets: true,
        minify: false,
        ssr: enableRouterServer ? qwikRouterVirtualEntry : resolve(appSrcDir, entrySsrFileName),
      },
      plugins: [
        ...plugins,
        optimizer.qwikVite({
          experimental: ['each', 'suspense', 'preventNavigate', 'enableRequestRewrite'],
          ssr: {
            manifestInput: clientManifest,
          },
        }),
      ],
      define: {
        'globalThis.qDev': !isProd,
        'globalThis.qInspector': false,
        'globalThis.PORT': port,
      },
    })
  );

  return clientManifest!;
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
    rmSync(dir);
  } catch {
    // ignore
  }
}

async function routerApp(req: Request, res: Response, next: NextFunction, appDir: string) {
  const ssrPath = join(appDir, 'server', `${qwikRouterVirtualEntry}.js`);
  // it's ok in the devserver to import core multiple times
  (globalThis as any).__qwik = null;
  const mod = await import(file(ssrPath));
  const router: any = mod.router;
  router(req, res, next);
}

async function ssrApp(
  req: Request,
  res: Response,
  appName: string,
  appDir: string,
  manifest: QwikManifest
) {
  const ssrPath = join(appDir, 'server', 'entry.ssr.js');
  // it's ok in the devserver to import core multiple times
  (globalThis as any).__qwik = null;
  const mod = await import(file(ssrPath));
  const render: Render = mod.default ?? mod.render;

  // ssr the document
  const base = `/${appName}/build/`;
  const url = new URL(`${req.protocol}://${req.hostname}${req.url}`).href;
  const ooosRequestId = `${process.pid}-${++ooosRequestCounter}`;

  const opts: RenderToStreamOptions = {
    stream: res,
    manifest,
    debug: true,
    base,
    serverData: {
      url,
      ooosRequestId,
    },
  };
  await render(opts);
}

function startersHomepage(_: Request, res: Response) {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!-- Some comment --><!DOCTYPE html>
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
  const path = join(repoRoot, 'starters', 'apps', 'base', 'public', 'favicon.svg');
  res.sendFile(path);
}

function printUsage() {
  console.log(`
Qwik Dev Server - Starter Apps Builder

Usage: node dev-server.ts [OPTIONS] [PORT]

OPTIONS:
  --build=APPNAME       Build a specific app and exit (don't start server)
  --build APPNAME       Same as --build=APPNAME
  
ARGUMENTS:
  PORT                  Port number (default: 3300)

Examples:
  node dev-server.ts                          # Start server on port 3300
  node dev-server.ts 3400                     # Start server on port 3400
  node dev-server.ts --build=qwikrouter-test  # Build qwikrouter-test and exit
  node dev-server.ts --build qwik-spa 3400    # Build qwik-spa and exit (port ignored)

Available apps:
${appNames.map((a) => `  - ${a}`).join('\n')}
  `);
}

async function main() {
  // Handle build-and-exit mode
  if (buildTarget) {
    if (!appNames.includes(buildTarget)) {
      console.error(`\n❌ Unknown app: "${buildTarget}"\n`);
      printUsage();
      process.exit(1);
    }

    console.log(`\n🏗️  Building ${buildTarget}...\n`);
    const appDir = join(appsDir, buildTarget);
    try {
      // Read package.json to determine if qwik-router should be enabled
      const pkgPath = join(appDir, 'package.json');
      const pkgJson: PackageJSON = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const enableRouterServer = !!pkgJson.__qwik__?.qwikRouter;

      await buildApp(appDir, buildTarget, enableRouterServer);
      console.log(`\n✅ Successfully built ${buildTarget}\n`);
      process.exit(0);
    } catch (error: any) {
      console.error(`\n❌ Build failed for ${buildTarget}:\n`, error.stack || error);
      process.exit(1);
    }
  }

  // Normal server mode
  const app = express();
  const partytownPath = resolve(repoRoot, 'node_modules', '@qwik.dev', 'partytown', 'lib');
  app.use(`/~partytown`, express.static(partytownPath));

  appNames.forEach((appName) => {
    const buildPath = join(appsDir, appName, 'dist', appName);
    app.use(`/${appName}`, express.static(buildPath));

    const publicPath = join(appsDir, appName, 'public');
    app.use(`/${appName}`, express.static(publicPath));
  });

  // Debug logging backchannel: browser sends errors/logs here
  app.post('/__log', express.text(), (req, res) => {
    console.error(`[BROWSER] ${req.body}`);
    res.status(204).end();
  });

  app.post('/__ooos-release/:requestId/:id', (req, res) => {
    const requestId = req.params.requestId;
    const id = req.params.id;
    const store = getOOOSReleaseStore();
    const key = getOOOSReleaseKey(requestId, id);
    const resolvers = store.resolvers.get(key);
    store.resolved.add(key);
    if (resolvers) {
      store.resolvers.delete(key);
      resolvers.forEach((resolve) => resolve());
    }
    res.status(204).end();
  });

  app.get('/', startersHomepage);
  app.get('/favicon*', favicon);
  app.all('/*', handleApp);

  const server = app.listen(port, () => {
    console.log(`E2E Dir: ${e2eDir}`);
    console.log(`Dev Server: ${address}\n`);

    console.log(`Starters:`);
    appNames.forEach((appName) => {
      console.log(`  ${address}${appName}/`);
    });
    console.log(``);
  });

  process.on('SIGTERM', () => server.close());
}

main();
