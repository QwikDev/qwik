import type { ViteDevServer, Connect } from 'vite';
import type { ServerResponse } from 'http';
import fs from 'fs';
import { join } from 'path';
import { Headers as HeadersPolyfill } from 'headers-polyfill';
import type { BuildContext } from '../types';
import type { EndpointModule } from '../../runtime/src/library/types';
import type { QwikViteDevResponse } from '../../../qwik/src/optimizer/src/plugins/vite';
import { loadUserResponse } from '../../middleware/request-handler/user-response';
import { getQwikCityUserContext } from '../../middleware/request-handler/utils';
import { buildFromUrlPathname } from '../build';
import { notFoundHandler } from '../../middleware/request-handler/fallback-handler';
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

      const serverRequestEv = fromDevServerHttp(url, req, res);
      const { request, response } = serverRequestEv;
      const result = await buildFromUrlPathname(ctx, pathname);
      if (result) {
        const { route, params } = result;
        const isEndpointOnly = route.type === 'endpoint';

        // use vite to dynamically load each layout/page module in this route's hierarchy
        const endpointModules: EndpointModule[] = [];
        for (const layout of route.layouts) {
          const layoutModule = await server.ssrLoadModule(layout.filePath, {
            fixStacktrace: true,
          });
          endpointModules.push(layoutModule);
        }
        const endpointModule = await server.ssrLoadModule(route.filePath, {
          fixStacktrace: true,
        });
        endpointModules.push(endpointModule);

        const userResponse = await loadUserResponse(
          request,
          url,
          params,
          endpointModules,
          ctx.opts.trailingSlash,
          isEndpointOnly
        );

        if (userResponse.type === 'endpoint') {
          // dev server endpoint handler
          response(userResponse.status, userResponse.headers, async (stream) => {
            if (typeof userResponse.body === 'string') {
              stream.write(userResponse.body);
            }
          });
          return;
        }

        if (userResponse.type === 'page') {
          if (userResponse.status === 404) {
            await notFoundHandler(serverRequestEv);
            return;
          }

          // qwik city vite plugin should handle dev ssr rendering
          // but add the qwik city user context to the response object
          (res as QwikViteDevResponse)._qwikUserCtx = {
            ...(res as QwikViteDevResponse)._qwikUserCtx,
            ...getQwikCityUserContext(userResponse),
          };
          // update node response with status and headers
          // but do not end() it, call next() so qwik plugin handles rendering
          res.statusCode = userResponse.status;
          userResponse.headers.forEach((value, key) => res.setHeader(key, value));
          next();
          return;
        }
      }

      // see if this path is a static file in one of these directories which vite will serve
      const publicDirs = ['dist', 'public'].map((dir) => join(server.config.root, dir));
      publicDirs.push(server.config.build.outDir);

      for (const publicDir of publicDirs) {
        try {
          // check for public path static asset
          await fs.promises.access(join(publicDir, pathname));

          // use vite's static file server
          next();
          return;
        } catch (e) {
          //
        }
      }

      // static file does not exist, 404
      await notFoundHandler(serverRequestEv);
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
    pathname.startsWith('/favicon.ico')
  );
}

function fromDevServerHttp(url: URL, req: Connect.IncomingMessage, res: ServerResponse) {
  const requestHeaders = new (typeof Headers === 'function' ? Headers : HeadersPolyfill)();
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
          return new Promise<void>((resolve, reject) => {
            res.write(chunk, (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
          });
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
