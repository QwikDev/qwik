import type { ViteDevServer } from 'vite';
import { basename } from 'path';
import type { BuildContext } from '../types';
import {
  endpointHandler,
  getEndpointResponse,
} from '../../middleware/request-handler/endpoint-handler';
import { getRouteParams } from '../../runtime/src/library/routing';
import { build } from '../build';
import { isMenuFileName } from '../markdown/menu';
import type { HttpMethod } from '../../runtime/src/library/types';
import {
  checkEndpointRedirect,
  checkPageRedirect,
} from '../../middleware/request-handler/redirect-handler';
import { getQwikCityUserContext, isAcceptJsonOnly } from '../../middleware/request-handler/utils';
import type { QwikViteDevResponse } from '../../../qwik/src/optimizer/src/plugins/vite';
import { convertNodeRequest, convertNodeResponse } from '../../middleware/express/utils';

export function configureDevServer(ctx: BuildContext | null, server: ViteDevServer) {
  if (ctx) {
    const routesDirWatcher = server.watcher.add(ctx.opts.routesDir);
    routesDirWatcher.on('all', (ev, path) => {
      if (ev === 'add' || ev === 'addDir' || ev === 'unlink' || ev === 'unlinkDir') {
        server.restart();
      } else if (ev === 'change') {
        const fileName = basename(path);
        if (isMenuFileName(fileName)) {
          server.restart();
        }
      }
    });
  }

  server.middlewares.use(async (nodeReq, nodeRes, next) => {
    try {
      if (ctx) {
        if (ctx.dirty) {
          await build(ctx);
        }

        const url = new URL(nodeReq.originalUrl!, `http://${nodeReq.headers.host}`);
        const pathname = url.pathname;

        for (const route of ctx.routes) {
          const match = route.pattern.exec(pathname);
          if (match) {
            const request = await convertNodeRequest(url, nodeReq);
            const method = request.method as HttpMethod;
            const params = getRouteParams(route.paramNames, match);

            if (route.type !== 'endpoint') {
              const pageRedirectResponse = checkPageRedirect(
                url,
                request.headers,
                ctx.opts.trailingSlash
              );
              if (pageRedirectResponse) {
                convertNodeResponse(pageRedirectResponse, nodeRes);
                return;
              }
            }

            const endpointModule = await server.ssrLoadModule(route.filePath, {
              fixStacktrace: true,
            });

            const endpointResponse = await getEndpointResponse(
              request,
              method,
              url,
              params,
              endpointModule
            );

            const endpointRedirectResponse = checkEndpointRedirect(endpointResponse);
            if (endpointRedirectResponse) {
              convertNodeResponse(endpointRedirectResponse, nodeRes);
              return;
            }

            if (route.type === 'endpoint' || isAcceptJsonOnly(request)) {
              const response = endpointHandler(method, endpointResponse);
              convertNodeResponse(response, nodeRes);
              return;
            }

            if (endpointResponse) {
              // modify the response, but do not end()
              if (typeof endpointResponse.status === 'number') {
                nodeRes.statusCode = endpointResponse.status;
              }
              if (endpointResponse.headers) {
                for (const [key, value] of Object.entries(endpointResponse.headers)) {
                  if (value) {
                    nodeRes.setHeader(key, value);
                  }
                }
              }
            }

            (nodeRes as QwikViteDevResponse)._qwikUserCtx = {
              ...(nodeRes as QwikViteDevResponse)._qwikUserCtx,
              ...getQwikCityUserContext(url, params, method, endpointResponse),
            };
          }
        }
      }

      next();
    } catch (e) {
      next(e);
    }
  });
}
