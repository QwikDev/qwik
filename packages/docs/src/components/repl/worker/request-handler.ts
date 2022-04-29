import { ctx } from './constants';
import type { QwikWorkerGlobal } from './repl-service-worker';

export const requestHandler = (ev: FetchEvent) => {
  const reqUrl = new URL(ev.request.url);
  const pathname = reqUrl.pathname;

  if (Array.isArray(ctx.clientModules)) {
    const clientModule = ctx.clientModules.find((m) => {
      const moduleUrl = new URL('./' + m.path, reqUrl);
      return pathname === moduleUrl.pathname;
    });

    if (clientModule) {
      return ev.respondWith(
        new Response(clientModule.code, {
          headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Qwik-Playground': self.qwikCore.version,
          },
        })
      );
    }
  }
};

declare const self: QwikWorkerGlobal;
