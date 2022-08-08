import type { ViteDevServer, Connect } from 'vite';
import type { ServerResponse } from 'http';
import fs from 'fs';
import { join } from 'path';
import { createHeaders } from '../../middleware/request-handler/headers';
import type { BuildContext } from '../types';
import type { RouteModule } from '../../runtime/src/library/types';
import type { QwikViteDevResponse } from '../../../qwik/src/optimizer/src/plugins/vite';
import { loadUserResponse } from '../../middleware/request-handler/user-response';
import { getQwikCityEnvData } from '../../middleware/request-handler/page-handler';
import { buildFromUrlPathname } from '../build';
import { endpointHandler } from '../../middleware/request-handler/endpoint-handler';
import { notFoundHandler } from '../../middleware/request-handler/error-handler';
import type { QwikCityRequestContext } from '../../middleware/request-handler/types';

export function configureDevServer(ctx: BuildContext, server: ViteDevServer) {
  server.middlewares.use(async (req, res, next) => {
    try {
      const url = new URL(req.originalUrl!, `http://${req.headers.host}`);
      const pathname = url.pathname;

      if (isVitePathname(pathname)) {
        next();
        return;
      }

      // see if this path is a static file in one of these directories which vite will serve
      const isAsset = await isStaticAsset(server, pathname);
      if (isAsset) {
        next();
        return;
      }

      const requestCtx = fromDevServerHttp(url, req, res);
      const result = await buildFromUrlPathname(ctx, pathname);
      if (result) {
        const { route, params } = result;

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

        const userResponse = await loadUserResponse(
          requestCtx,
          params,
          routeModules,
          ctx.opts.trailingSlash
        );

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
      }

      // static file does not exist, 404
      await notFoundHandler(requestCtx);
    } catch (e) {
      next(e);
    }
  });
}

function isVitePathname(pathname: string) {
  return (
    pathname.startsWith('/@fs/') ||
    pathname.startsWith('/@id/') ||
    pathname.startsWith('/@vite/') ||
    pathname.startsWith('/__vite_ping') ||
    pathname.startsWith('/__open-in-editor') ||
    pathname.startsWith('/@qwik-city-plan') ||
    pathname.startsWith('/src/') ||
    pathname.startsWith('/node_modules/') ||
    pathname.startsWith('/favicon.ico')
  );
}

async function isStaticAsset(server: ViteDevServer, pathname: string) {
  const localPath = pathname.slice(1);
  const publicDirs = ['dist', 'public'].map((dir) => join(server.config.root, dir));
  publicDirs.push(server.config.build.outDir);

  for (const publicDir of publicDirs) {
    try {
      // check for public path static file asset
      const filePath = join(publicDir, localPath);
      const s = await fs.promises.stat(filePath);
      if (s.isFile()) {
        return true;
      }
    } catch (e) {
      //
    }
  }
  return false;
}

function fromDevServerHttp(url: URL, req: Connect.IncomingMessage, res: ServerResponse) {
  const requestHeaders = createHeaders();
  const nodeRequestHeaders = req.headers;
  for (const key in nodeRequestHeaders) {
    const value = nodeRequestHeaders[key];
    if (typeof value === 'string') {
      requestHeaders.set(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) {
        requestHeaders.append(key, v);
      }
    }
  }

  const getRequestBody = async () => {
    const buffers = [];
    for await (const chunk of req) {
      buffers.push(chunk);
    }
    return Buffer.concat(buffers).toString();
  };

  const requestCtx: QwikCityRequestContext = {
    request: {
      headers: requestHeaders,
      formData: async () => {
        return new URLSearchParams(await getRequestBody());
      },
      json: async () => {
        return JSON.parse(await getRequestBody()!);
      },
      method: req.method || 'GET',
      text: getRequestBody,
      url: url.href,
    },
    response: (status, headers, body) => {
      res.statusCode = status;
      headers.forEach((value, key) => res.setHeader(key, value));
      body({
        write: (chunk) => {
          res.write(chunk);
        },
      }).finally(() => {
        res.end();
      });
      return res;
    },
    url,
  };

  return requestCtx;
}
