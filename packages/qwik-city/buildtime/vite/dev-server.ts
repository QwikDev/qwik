import type { ViteDevServer } from 'vite';
import type { BuildContext } from '../types';
import type { EndpointModule } from '../../runtime/src/library/types';
import type { QwikViteDevResponse } from '../../../qwik/src/optimizer/src/plugins/vite';
import { loadUserResponse } from '../../middleware/request-handler/user-response';
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
          // qwik city vite plugin should handle dev ssr rendering
          // but add the qwik city user context to the response object
          (nodeRes as QwikViteDevResponse)._qwikUserCtx = {
            ...(nodeRes as QwikViteDevResponse)._qwikUserCtx,
            ...getQwikCityUserContext(userResponse),
          };
          // update node response with status and headers
          // but do not end() it, call next() so qwik plugin handles rendering
          nodeRes.statusCode = userResponse.status;
          userResponse.headers.forEach((value, key) => nodeRes.setHeader(key, value));
          next();
          return;
        }
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
