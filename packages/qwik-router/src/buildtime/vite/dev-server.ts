import type { ServerResponse } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Connect, type RunnableDevEnvironment, type ViteDevServer } from 'vite';
import { computeOrigin, getUrl } from '../../middleware/node/http';
// import { checkBrand } from '../../middleware/request-handler/resolve-request-handlers';
// import type { ActionInternal, LoaderInternal, RouteModule } from '../../runtime/src/types';
// import { getExtension, normalizePath } from '../../utils/fs';
import type { BuildContext } from '../types';
import { formatError } from './format-error';

/*
req -> vite

req is for src? => vite responds with built file

req is anything else? => send to environment, ask node-server to handle it

*/
export function ssrDevMiddleware(ctx: BuildContext, server: ViteDevServer) {
  return async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    try {
      const url = getUrl(req, computeOrigin(req));
      console.log({ url });

      // if (shouldSkipRequest(url.pathname) || isVitePing(url.pathname, req.headers)) {
      //   next();
      //   return;
      // }

      const nodeMiddlewareIndex = join(
        fileURLToPath(import.meta.url),
        '..',
        '..',
        'middleware',
        'node',
        'entry.dev'
      );

      // Run the node middleware in-process
      const mod = await (server.environments.node as RunnableDevEnvironment).runner.import(
        nodeMiddlewareIndex
      );
      mod.default(req, res, next);
    } catch (e: any) {
      if (e instanceof Error) {
        server.ssrFixStacktrace(e);
        formatError(e);
      }
      next(e);
      return;
    }
  };
}

// function getUnmatchedRouteHtml(url: URL, ctx: BuildContext): string {
//   const blue = '#006ce9';
//   const routesAndDistance = sortRoutesByDistance(ctx.routes, url);
//   return `
//   <html>
//     <head>
//       <meta charset="utf-8">
//       <meta http-equiv="Status" content="404">
//       <title>404 Not Found</title>
//       <meta name="viewport" content="width=device-width,initial-scale=1">
//       <style>
//         body { color: ${blue}; background-color: #fafafa; padding: 30px; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Roboto, sans-serif; }
//         div, p { max-width: 70vw; margin: 60px auto 30px auto; background: white; border-radius: 4px; box-shadow: 0px 0px 50px -20px ${blue}; word-break: break-word; }
//         div { display: flex; flex-direction: column; }
//         strong { display: inline-block; padding: 15px; background: ${blue}; color: white; }
//         span { display: inline-block; padding: 15px; }
//         a { padding: 15px; }
//         a:hover { background-color: rgba(0, 108, 233, 0.125); }
//         .recommended { font-size: 0.8em; font-weight: 700; padding: 10px; }
//       </style>
//     </head>
//     <body>
//       <p><strong>404</strong> <span>${url.pathname} not found.</span></p>

//       <div>
//         <strong>Available Routes</strong>

//         ${routesAndDistance
//           .map(
//             ([route, distance], i) =>
//               `<a href="${route.pathname}">${route.pathname}${
//                 i === 0 && distance < 3
//                   ? '<span class="recommended"> 👈 maybe you meant this?</span>'
//                   : ''
//               } </a>`
//           )
//           .join('')}
//       </div>
//     </body>
//   </html>`;
// }

// const sortRoutesByDistance = (routes: BuildRoute[], url: URL) => {
//   const pathname = url.pathname;
//   const routesWithDistance = routes.map(
//     (route) => [route, levenshteinDistance(pathname, route.pathname)] as const
//   );
//   return routesWithDistance.sort((a, b) => a[1] - b[1]);
// };

// const levenshteinDistance = (s: string, t: string) => {
//   if (!s.endsWith('/')) {
//     s = s + '/';
//   }
//   if (!t.endsWith('/')) {
//     t = t + '/';
//   }
//   const arr = [];
//   for (let i = 0; i <= t.length; i++) {
//     arr[i] = [i];
//     for (let j = 1; j <= s.length; j++) {
//       arr[i][j] =
//         i === 0
//           ? j
//           : Math.min(
//               arr[i - 1][j] + 1,
//               arr[i][j - 1] + 1,
//               arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1)
//             );
//     }
//   }
//   return arr[t.length][s.length];
// };

// /**
//  * Static file server for files written directly to the 'dist' dir.
//  *
//  * Only handles the simplest cases.
//  */
// export function staticDistMiddleware({ config }: ViteDevServer) {
//   const distDirs = new Set(
//     ['dist', config.build.outDir, config.publicDir].map((d) =>
//       normalizePath(resolve(config.root, d))
//     )
//   );

//   return async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
//     const url = new URL(req.originalUrl!, `http://${req.headers.host}`);

//     if (shouldSkipRequest(url.pathname)) {
//       next();
//       return;
//     }

//     const relPath = `${url.pathname.slice(1)}${url.search}`;

//     const ext = getExtension(relPath);
//     const contentType = STATIC_CONTENT_TYPES[ext];
//     if (!contentType) {
//       next();
//       return;
//     }

//     for (const distDir of distDirs) {
//       try {
//         const filePath = join(distDir, relPath);
//         const s = await fs.promises.stat(filePath);
//         if (s.isFile()) {
//           res.writeHead(200, {
//             'Content-Type': contentType,
//             'X-Source-Path': filePath,
//           });
//           fs.createReadStream(filePath).pipe(res);
//           return;
//         }
//       } catch (e) {
//         //
//       }
//     }

//     next();
//   };
// }

// function formatDevSerializeError(err: any, routeModulePaths: WeakMap<RouteModule, string>) {
//   const requestHandler = err.requestHandler;

//   if (requestHandler?.name) {
//     let errMessage = `Data returned from the ${requestHandler.name}() endpoint must be serializable `;
//     errMessage += `so it can also be transferred over the network in an HTTP response. `;
//     errMessage += `Please ensure that the data returned from ${requestHandler.name}() is limited to only strings, numbers, booleans, arrays or objects, and does not have any circular references. `;
//     errMessage += `Error: ${err.message}`;
//     err.message = errMessage;

//     const endpointModule = err.endpointModule;
//     const filePath = routeModulePaths.get(endpointModule);
//     if (filePath) {
//       try {
//         const code = fs.readFileSync(filePath, 'utf-8');
//         err.plugin = 'vite-plugin-qwik-router';
//         err.id = normalizePath(filePath);
//         err.loc = {
//           file: err.id,
//           line: undefined,
//           column: undefined,
//         };
//         err.stack = '';
//         const lines = code.split('\n');
//         const line = lines.findIndex((line) => line.includes(requestHandler.name));
//         if (line > -1) {
//           err.loc.line = line + 1;
//         }
//       } catch (e) {
//         // nothing
//       }
//     }
//   }
//   return err;
// }

// const FS_PREFIX = `/@fs/`;
// const VALID_ID_PREFIX = `/@id/`;
// const VITE_PUBLIC_PATH = `/@vite/`;
// const internalPrefixes = [FS_PREFIX, VALID_ID_PREFIX, VITE_PUBLIC_PATH];
// const InternalPrefixRE = new RegExp(`^(?:${internalPrefixes.join('|')})`);

// function shouldSkipRequest(pathname: string) {
//   if (pathname.startsWith('/@qwik-router-')) {
//     return true;
//   }
//   if (
//     pathname.includes('__open-in-editor') ||
//     InternalPrefixRE.test(pathname) ||
//     pathname.startsWith('/node_modules/')
//   ) {
//     return true;
//   }
//   if (pathname.includes('favicon')) {
//     return true;
//   }
//   if (pathname.startsWith('/src/') || pathname.startsWith('/@fs/')) {
//     const ext = getExtension(pathname);
//     if (SKIP_SRC_EXTS[ext]) {
//       return true;
//     }
//   }
//   return false;
// }

// function isVitePing(url: string, headers: Connect.IncomingMessage['headers']) {
//   return url === '/' && headers.accept === '*/*' && headers['sec-fetch-mode'] === 'no-cors';
// }

// const SKIP_SRC_EXTS: { [ext: string]: boolean } = {
//   '.tsx': true,
//   '.ts': true,
//   '.jsx': true,
//   '.js': true,
//   '.md': true,
//   '.mdx': true,
//   '.css': true,
//   '.scss': true,
//   '.sass': true,
//   '.less': true,
//   '.styl': true,
//   '.stylus': true,
// };

// const STATIC_CONTENT_TYPES: { [ext: string]: string } = {
//   '.js': 'text/javascript',
//   '.mjs': 'text/javascript',
//   '.json': 'application/json',
//   '.css': 'text/css',
//   '.html': 'text/html',
//   '.svg': 'image/svg+xml',
//   '.png': 'image/png',
//   '.gif': 'image/gif',
//   '.jpeg': 'image/jpeg',
//   '.jpg': 'image/jpeg',
//   '.ico': 'image/x-icon',
// };

// const DEV_SERVICE_WORKER = `/* Qwik Router Dev Service Worker */
// self.addEventListener('install', () => self.skipWaiting());
// self.addEventListener('activate', (ev) => ev.waitUntil(self.clients.claim()));
// `;
