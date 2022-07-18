import type { ViteDevServer } from 'vite';
import type { BuildContext } from '../types';
import type { HttpMethod } from '../../runtime/src/library/types';
import type { QwikViteDevResponse } from '../../../qwik/src/optimizer/src/plugins/vite';
import {
  endpointHandler,
  getEndpointResponse,
} from '../../middleware/request-handler/endpoint-handler';
import {
  checkEndpointRedirect,
  checkPageRedirect,
} from '../../middleware/request-handler/redirect-handler';
import { getQwikCityUserContext, isAcceptJsonOnly } from '../../middleware/request-handler/utils';
import { fromNodeRequest, toNodeResponse } from '../../middleware/express/utils';
import { buildFromUrlPathname } from '../build';

export function configureDevServer(ctx: BuildContext, server: ViteDevServer) {
  server.middlewares.use(async (nodeReq, nodeRes, next) => {
    try {
      const url = new URL(nodeReq.originalUrl!, `http://${nodeReq.headers.host}`);
      const pathname = url.pathname;

      if (isVitePathname(pathname)) {
        next();
        return;
      }

      const result = await buildFromUrlPathname(ctx, pathname);
      if (result) {
        const { route, params } = result;
        const request = await fromNodeRequest(url, nodeReq);
        const method = request.method as HttpMethod;

        if (route.type !== 'endpoint') {
          const pageRedirectResponse = checkPageRedirect(
            url,
            request.headers,
            ctx.opts.trailingSlash
          );
          if (pageRedirectResponse) {
            await toNodeResponse(pageRedirectResponse, nodeRes);
            nodeRes.end();
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
          await toNodeResponse(endpointRedirectResponse, nodeRes);
          nodeRes.end();
          return;
        }

        if (route.type === 'endpoint' || isAcceptJsonOnly(request)) {
          const response = endpointHandler(method, endpointResponse);
          await toNodeResponse(response, nodeRes);
          nodeRes.end();
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
    } catch (e) {
      next(e);
      return;
    }

    next();
  });
}

function isVitePathname(pathname: string) {
  return (
    pathname.startsWith('/@fs/') ||
    pathname.startsWith('/@id/') ||
    pathname.startsWith('/@qwik-city-plan') ||
    pathname.startsWith('/@vite/') ||
    pathname.startsWith('/src/') ||
    pathname.startsWith('/favicon.ico')
  );
}
