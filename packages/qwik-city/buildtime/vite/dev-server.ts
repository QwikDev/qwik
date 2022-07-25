import type { ViteDevServer } from 'vite';
import type { BuildContext } from '../types';
import type { EndpointModule } from '../../runtime/src/library/types';
import type { QwikViteDevResponse } from '../../../qwik/src/optimizer/src/plugins/vite';
import { loadEndpointResponse } from '../../middleware/request-handler/endpoint-handler';
import { checkPageRedirect } from '../../middleware/request-handler/redirect-handler';
import { getQwikCityUserContext } from '../../middleware/request-handler/utils';
import { fromNodeHttp } from '../../middleware/express/utils';
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
        const { request, response } = await fromNodeHttp(url, nodeReq, nodeRes);
        const isEndpointOnly = route.type === 'endpoint';

        if (!isEndpointOnly) {
          // content page, so check if the trailing slash should be redirected
          checkPageRedirect(url, response, ctx.opts.trailingSlash);
          if (response.handled) {
            // page redirect will add or remove the trailing slash depending on the option
            nodeRes.end();
            return;
          }
        }

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

        await loadEndpointResponse(request, response, url, params, endpointModules, isEndpointOnly);

        if (response.handled) {
          nodeRes.end();
          return;
        }

        // modify the response, but do not end()
        // the qwik vite plugin will handle dev page rendering
        nodeRes.statusCode = response.statusCode;
        for (const [key, value] of Object.entries(response.headers)) {
          if (value) {
            nodeRes.setHeader(key, value);
          }
        }

        (nodeRes as QwikViteDevResponse)._qwikUserCtx = {
          ...(nodeRes as QwikViteDevResponse)._qwikUserCtx,
          ...getQwikCityUserContext(url, params, response),
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
