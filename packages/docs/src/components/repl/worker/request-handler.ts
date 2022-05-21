import { getCtx } from './context';
import type { QwikWorkerGlobal } from './repl-service-worker';

export const requestHandler = (ev: FetchEvent) => {
  const reqUrl = new URL(ev.request.url);
  const pathname = reqUrl.pathname;
  const parts = pathname.split('/');

  if (parts.length > 2) {
    const clientId = parts[2];
    const ctx = getCtx(clientId);

    if (Array.isArray(ctx.clientModules)) {
      const clientModule = ctx.clientModules.find((m) => {
        const moduleUrl = new URL('../' + m.path, reqUrl);
        return pathname === moduleUrl.pathname;
      });

      if (clientModule) {
        return ev.respondWith(
          new Response(clientModule.code, {
            headers: {
              'Content-Type': 'application/javascript; charset=utf-8',
              'Cache-Control': 'no-store',
              'X-Qwik-Version': self.qwikCore?.version || '',
              'X-Qwik-Client-Id': clientId,
            },
          })
        );
      }
    }
  }
};

declare const self: QwikWorkerGlobal;
