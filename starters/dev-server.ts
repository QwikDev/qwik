// DO NOT USE FOR PRODUCTION!!!
// Internal Testing/Dev Server
// DO NOT USE FOR PRODUCTION!!!

/* eslint-disable no-console */

import type { QwikManifest } from "@qwik.dev/core/optimizer";
import type { Render, RenderToStreamOptions } from "@qwik.dev/core/server";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, type InlineConfig, type PluginOption } from "vite";
import type { PackageJSON } from "../scripts/util";

const isWindows = process.platform === "win32";

// map the file path to a url for windows only
const file = (filePath: string) => {
  return isWindows ? pathToFileURL(filePath).toString() : filePath;
};

// Escape path for imports in windows
const escapeChars = (filePath: string) => {
  return isWindows ? filePath.replace(/\\/g, "\\\\") : filePath;
};

const app = express();
const port = parseInt(process.argv[process.argv.length - 1], 10) || 3300;
const address = `http://localhost:${port}/`;
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const startersDir = __dirname;
const startersAppsDir = join(startersDir, "apps");
const appNames = readdirSync(startersAppsDir).filter(
  (p) => statSync(join(startersAppsDir, p)).isDirectory() && p !== "base",
);

/** Used when qwik-router server is enabled */
const qwikRouterVirtualEntry = "@router-ssr-entry";
const entrySsrFileName = "entry.ssr.tsx";

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
      const relPath = relative(startersAppsDir, url.pathname);
      if (!relPath.startsWith(".")) {
        url.pathname = relPath;
      }
    }
    const paths = url.pathname.split("/");
    const appName = paths[1];
    const appDir = join(startersAppsDir, appName);
    if (!existsSync(appDir)) {
      res.status(404).send(`❌ Invalid dev-server path: ${appDir}`);
      return;
    }

    console.log(req.method, req.url, `[${appName} build/ssr]`);

    const pkgPath = join(appDir, "package.json");
    const pkgJson: PackageJSON = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const enableRouterServer = !!pkgJson.__qwik__?.qwikRouter;

    let clientManifest = cache.get(appDir);
    if (!clientManifest) {
      clientManifest = buildApp(appDir, appName, enableRouterServer);
      cache.set(appDir, clientManifest);
    }

    const resolved = await clientManifest;
    if (url.pathname.endsWith(".js")) {
      res.set("Content-Type", "text/javascript");
    } else {
      res.set("Content-Type", "text/html");
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
      res.set("Content-Type", "text/plain; charset=utf-8");
      res.send(`❌ ${e.stack || e}`);
    }
  }
}

async function buildApp(
  appDir: string,
  appName: string,
  enableRouterServer: boolean,
) {
  const optimizer = await import("@qwik.dev/core/optimizer");
  const appSrcDir = join(appDir, "src");
  const appDistDir = join(appDir, "dist");
  const appServerDir = join(appDir, "server");
  const basePath = `/${appName}/`;
  const isProd = appName.includes(".prod");

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
      name: "devPlugin",
      resolveId(id) {
        if (id.endsWith(qwikRouterVirtualEntry)) {
          return qwikRouterVirtualEntry;
        }
      },
      load(id) {
        if (id.endsWith(qwikRouterVirtualEntry)) {
          return `import { createQwikRouter } from '@qwik.dev/router/middleware/node';
import render from '${escapeChars(resolve(appSrcDir, "entry.ssr"))}';
const { router, notFound } = createQwikRouter({
  render,
  base: '${basePath}build/',
});
export {
  router,
  notFound
}
`;
        }
      },
    });
    const qwikRouterVite = await import("@qwik.dev/router/vite");
    // TODO when you add this, vite-imagetools images no longer become assets!!! (they still get emitted, but don't show up in the build)
    // const qwikRouterSsg = await import(
    //   "@qwik.dev/router/adapters/node-server/vite"
    // );

    plugins.push(
      qwikRouterVite.qwikRouter({
        rewriteRoutes: [
          {
            paths: {
              projects: "projekte",
            },
          },
        ],
      }) as PluginOption,
      // qwikRouterSsg.nodeServerAdapter({
      //   ssg: null,
      // }) as PluginOption,
    );
  }

  const getInlineConf = (extra?: InlineConfig): InlineConfig => ({
    root: appDir,
    mode: isProd ? "production" : "development",
    configFile: false,
    base: basePath,
    ...extra,
    resolve: {
      conditions: [isProd ? "production" : "development"],
      mainFields: [],
    },
  });

  await build(
    getInlineConf({
      build: {
        minify: false,
      },
      define: {
        "globalThis.qSerialize": true,
        "globalThis.qDev": !isProd,
        "globalThis.qInspector": false,
        "globalThis.PORT": port,
      },
      plugins: [
        ...plugins,
        optimizer.qwikVite({
          entryStrategy: { type: "segment" },
          client: {
            manifestOutput(manifest) {
              clientManifest = manifest;
            },
          },
          experimental: ["preventNavigate", "enableRequestRewrite"],
        }),
      ],
    }),
  );

  await build(
    getInlineConf({
      build: {
        minify: false,
        ssr: enableRouterServer
          ? qwikRouterVirtualEntry
          : resolve(appSrcDir, entrySsrFileName),
      },
      plugins: [
        ...plugins,
        optimizer.qwikVite({
          experimental: ["preventNavigate", "enableRequestRewrite"],
          ssr: {
            manifestInput: clientManifest,
          },
        }),
      ],
      define: {
        "globalThis.qDev": !isProd,
        "globalThis.qInspector": false,
        "globalThis.PORT": port,
      },
    }),
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
    /**/
  }
}

async function routerApp(
  req: Request,
  res: Response,
  next: NextFunction,
  appDir: string,
) {
  const ssrPath = join(appDir, "server", `${qwikRouterVirtualEntry}.js`);
  // it's ok in the devserver to import core multiple times
  (globalThis as any).__qwik = null;
  const mod = await import(file(ssrPath));
  const router: any = mod.router;
  router(req, res, () => {
    mod.notFound(req, res, () => {
      next();
    });
  });
}

async function ssrApp(
  req: Request,
  res: Response,
  appName: string,
  appDir: string,
  manifest: QwikManifest,
) {
  const ssrPath = join(appDir, "server", "entry.ssr.js");
  // it's ok in the devserver to import core multiple times
  (globalThis as any).__qwik = null;
  const mod = await import(file(ssrPath));
  const render: Render = mod.default ?? mod.render;

  // ssr the document
  const base = `/${appName}/build/`;
  const url = new URL(`${req.protocol}://${req.hostname}${req.url}`).href;

  const opts: RenderToStreamOptions = {
    stream: res,
    manifest,
    debug: true,
    base,
    serverData: {
      url,
    },
  };
  await render(opts);
}

function startersHomepage(_: Request, res: Response) {
  res.set("Content-Type", "text/html; charset=utf-8");
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
        ${appNames.map((a) => `<li><a href="/${a}/">${a}</a></li>`).join("")}
      </ul>
    </body>
  </html>
  `);
}

function favicon(_: Request, res: Response) {
  const path = join(startersAppsDir, "base", "public", "favicon.svg");
  res.sendFile(path);
}

async function main() {
  const partytownPath = resolve(
    startersDir,
    "..",
    "node_modules",
    "@qwik.dev",
    "partytown",
    "lib",
  );
  app.use(`/~partytown`, express.static(partytownPath));

  appNames.forEach((appName) => {
    const buildPath = join(startersAppsDir, appName, "dist", appName);
    app.use(`/${appName}`, express.static(buildPath));

    const publicPath = join(startersAppsDir, appName, "public");
    app.use(`/${appName}`, express.static(publicPath));
  });

  app.get("/", startersHomepage);
  app.get("/favicon*", favicon);
  app.all("/*", handleApp);

  const server = app.listen(port, () => {
    console.log(`Starter Dir: ${startersDir}`);
    console.log(`Dev Server: ${address}\n`);

    console.log(`Starters:`);
    appNames.forEach((appName) => {
      console.log(`  ${address}${appName}/`);
    });
    console.log(``);
  });

  process.on("SIGTERM", () => server.close());
}

main();
