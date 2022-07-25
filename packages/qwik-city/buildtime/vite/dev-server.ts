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
        const { request, response } = fromNodeHttp(url, nodeReq, nodeRes);
        const isEndpointOnly = route.type === 'endpoint';

        if (!isEndpointOnly) {
          // content page, so check if the trailing slash should be redirected
          const redirectResponse = checkPageRedirect(url, ctx.opts.trailingSlash, response);
          if (redirectResponse) {
            // page redirect will add or remove the trailing slash depending on the option
            return redirectResponse;
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

        const userResponseContext = await loadEndpointResponse(
          request,
          url,
          params,
          endpointModules,
          isEndpointOnly
        );

        if (userResponseContext.handler === 'endpoint') {
          response(
            userResponseContext.status,
            userResponseContext.headers,
            () => userResponseContext.body
          );
          return;
        }

        (nodeRes as QwikViteDevResponse)._qwikUserCtx = {
          ...(nodeRes as QwikViteDevResponse)._qwikUserCtx,
          ...getQwikCityUserContext(userResponseContext),
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
