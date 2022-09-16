import type { ViteDevServer, Connect } from 'vite';
import type { ServerResponse } from 'http';
import fs from 'fs';
import { extname, join, resolve } from 'path';
import type { BuildContext } from '../types';
import type { RouteModule } from '../../runtime/src/library/types';
import type { QwikViteDevResponse } from '../../../qwik/src/optimizer/src/plugins/vite';
import { loadUserResponse, updateRequestCtx } from '../../middleware/request-handler/user-response';
import { getQwikCityEnvData, pageHandler } from '../../middleware/request-handler/page-handler';
import { updateBuildContext } from '../build';
import { endpointHandler } from '../../middleware/request-handler/endpoint-handler';
import {
  errorResponse,
  ErrorResponse,
  notFoundHandler,
} from '../../middleware/request-handler/error-handler';
import {
  redirectResponse,
  RedirectResponse,
} from '../../middleware/request-handler/redirect-handler';
import { normalizePath } from '../../utils/fs';
import type { RenderToStringResult } from '@builder.io/qwik/server';
import { getRouteParams } from '../../runtime/src/library/routing';
import { fromNodeHttp } from '../../middleware/node/http';

export function ssrDevMiddleware(ctx: BuildContext, server: ViteDevServer) {
  const matchRouteRequest = (pathname: string) => {
    for (const route of ctx.routes) {
      const match = route.pattern.exec(pathname);
      if (match) {
        return {
          route,
          params: getRouteParams(route.paramNames, match),
        };
      }
    }

    if (ctx.opts.trailingSlash && !pathname.endsWith('/')) {
      const pathnameWithSlash = pathname + '/';
      for (const route of ctx.routes) {
        const match = route.pattern.exec(pathnameWithSlash);
        if (match) {
          return {
            route,
            params: getRouteParams(route.paramNames, match),
          };
        }
      }
    }

    return null;
  };

  return async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    try {
      const url = new URL(req.originalUrl!, `http://${req.headers.host}`);

      if (isViteInternalRequest(url.pathname)) {
        next();
        return;
      }

      const requestCtx = fromNodeHttp(url, req, res);
      updateRequestCtx(requestCtx, ctx.opts.trailingSlash);

      await updateBuildContext(ctx);

      for (const d of ctx.diagnostics) {
        if (d.type === 'error') {
          console.error(d.message);
        } else {
          console.warn(d.message);
        }
      }

      const routeResult = matchRouteRequest(requestCtx.url.pathname);
      if (routeResult) {
        const { route, params } = routeResult;

        // use vite to dynamically load each layout/page module in this route's hierarchy
        const routeModules: RouteModule[] = [];
        for (const layout of route.layouts) {
          const layoutModule = await server.ssrLoadModule(layout.filePath, {
            fixStacktrace: true,
          });
          routeModules.push(layoutModule);
        }
        const endpointModule = await server.ssrLoadModule(route.filePath, {
          fixStacktrace: true,
        });
        routeModules.push(endpointModule);

        try {
          const userResponse = await loadUserResponse(
            requestCtx,
            params,
            routeModules,
            {},
            ctx.opts.trailingSlash,
            ctx.opts.basePathname
          );

          if (userResponse.type === 'pagedata') {
            // dev server endpoint handler
            await pageHandler(requestCtx, userResponse, noopDevRender);
            return;
          }

          if (userResponse.type === 'endpoint') {
            // dev server endpoint handler
            await endpointHandler(requestCtx, userResponse);
            return;
          }

          // qwik city vite plugin should handle dev ssr rendering
          // but add the qwik city user context to the response object
          const envData = getQwikCityEnvData(userResponse);
          if (ctx.isDevServerClientOnly) {
            // because we stringify this content for the client only
            // dev server, there's some potential stringify issues
            // client only dev server will re-fetch anyways, so reset
            envData.qwikcity.response.body = undefined;
          }

          (res as QwikViteDevResponse)._qwikEnvData = {
            ...(res as QwikViteDevResponse)._qwikEnvData,
            ...envData,
          };

          // update node response with status and headers
          // but do not end() it, call next() so qwik plugin handles rendering
          res.statusCode = userResponse.status;
          userResponse.headers.forEach((value, key) => res.setHeader(key, value));
          next();
          return;
        } catch (e: any) {
          if (e instanceof RedirectResponse) {
            redirectResponse(requestCtx, e);
          } else if (e instanceof ErrorResponse) {
            errorResponse(requestCtx, e);
          } else {
            next(e);
          }
          return;
        }
      }

      if (!routeResult) {
        // test if this is a dev service-worker.js request
        for (const sw of ctx.serviceWorkers) {
          const match = sw.pattern.exec(requestCtx.url.pathname);
          if (match) {
            res.setHeader('Content-Type', 'text/javascript');
            res.end(DEV_SERVICE_WORKER);
            return;
          }
        }
      }

      if (!routeResult && req.headers.accept && req.headers.accept.includes('text/html')) {
        /**
         * if no route match, but is html request, fast path to 404
         * otherwise qwik plugin will take over render without envData causing error
         */
        // TODO: after file change, need to manual page refresh to see changes currently
        //       there's two ways handling HMR for page endpoint with error
        // 1. Html response inject `import.meta.hot.accept('./pageEndpoint_FILE_URL', () => { location.reload })`
        // 2. watcher, diff previous & current file content, a bit expensive
        notFoundHandler(requestCtx);
        return;
      }

      next();
    } catch (e) {
      next(e);
    }
  };
}

export function dev404Middleware() {
  return async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    try {
      const url = new URL(req.originalUrl!, `http://${req.headers.host}`);
      const requestCtx = fromNodeHttp(url, req, res);
      await notFoundHandler(requestCtx);
    } catch (e) {
      next(e);
    }
  };
}

/**
 * Static file server for files written directly to the 'dist' dir.
 * Only handles the simplest cases.
 */
export function staticDistMiddleware({ config }: ViteDevServer) {
  const distDirs = new Set(
    ['dist', config.build.outDir].map((d) => normalizePath(resolve(config.root, d)))
  );

  const mimes: { [ext: string]: string } = {
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.json': 'application/json',
    '.css': 'text/css',
    '.html': 'text/html',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
  };

  return async (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    const url = new URL(req.originalUrl!, `http://${req.headers.host}`);

    if (isViteInternalRequest(url.pathname)) {
      next();
      return;
    }

    const relPath = url.pathname.slice(1);

    const ext = extname(relPath).toLowerCase();
    const contentType = mimes[ext];

    if (!contentType) {
      next();
      return;
    }

    for (const distDir of distDirs) {
      try {
        const filePath = join(distDir, relPath);
        const s = await fs.promises.stat(filePath);
        if (s.isFile()) {
          res.writeHead(200, {
            'Content-Type': contentType,
            'X-Source-Path': filePath,
          });
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      } catch (e) {
        //
      }
    }

    next();
  };
}

async function noopDevRender() {
  const result: RenderToStringResult = {
    html: '',
    timing: {
      render: 0,
      snapshot: 0,
    },
    prefetchResources: [],
    snapshotResult: null,
  };
  return result;
}

const FS_PREFIX = `/@fs/`;
const VALID_ID_PREFIX = `/@id/`;
const VITE_PUBLIC_PATH = `/@vite/`;
const internalPrefixes = [FS_PREFIX, VALID_ID_PREFIX, VITE_PUBLIC_PATH];
const InternalPrefixRE = new RegExp(`^(?:${internalPrefixes.join('|')})`);
const isViteInternalRequest = (url: string): boolean => {
  return url.includes('__open-in-editor') || InternalPrefixRE.test(url);
};

const DEV_SERVICE_WORKER = `/* Qwik City Dev Service Worker */
addEventListener('install', () => self.skipWaiting());
addEventListener('activate', () => self.clients.claim());
`;
