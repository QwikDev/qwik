import { getCtx } from './context';
import type { QwikWorkerGlobal } from './repl-service-worker';

export const requestHandler = (ev: FetchEvent) => {
  const reqUrl = new URL(ev.request.url);
  const pathname = reqUrl.pathname;
  const parts = pathname.split('/');
  const subDir = parts[1];
  const clientId = parts[2];

  if (subDir !== 'repl' || clientId === 'repl-server.html') {
    return;
  }

  const ctx = getCtx(clientId, false);
  if (ctx) {
    if (pathname === `/repl/${clientId}/`) {
      // ssr'd html response
      const html = ctx.html || '';
      return ev.respondWith(
        new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Qwik-REPL-App': 'ssr-result',
            'X-Qwik-Client-Id': clientId,
          },
        })
      );
    }

    if (Array.isArray(ctx.clientModules)) {
      // js module response
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
              'X-Qwik-REPL-App': 'client-module',
              'X-Qwik-Client-Id': clientId,
            },
          })
        );
      }
    }
  }

  return ev.respondWith(
    new Response('', {
      headers: {
        'Cache-Control': 'no-store',
        'X-Qwik-REPL-App': 'Not-Found',
      },
      status: 404,
    })
  );
};

declare const self: QwikWorkerGlobal;
