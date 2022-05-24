/* eslint-disable no-console */
import type { ReplEventMessage } from '../types';
import { getCtx } from './context';
import { sendMessageToReplServer } from './repl-messenger';

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
      const html = injectDevHtml(clientId, ctx.html);
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
        const replEvent: ReplEventMessage = {
          type: 'event',
          clientId,
          event: {
            kind: 'client-module',
            scope: 'network',
            message: reqUrl.pathname + reqUrl.search,
            start: performance.now(),
          },
        };
        sendMessageToReplServer(replEvent);

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

const injectDevHtml = (clientId: string, html?: string) => {
  const s = `
  (() => {
  const sendToServerWindow = (data) => {
    parent.postMessage(JSON.stringify({
      type: 'event',
      clientId: '${clientId}',
      data
    }));
  };

  const log = console.log;
  const warn = console.warn;
  const error = console.error;
  const debug = console.debug;

  console.log = (...args) => {
    sendToServerWindow({
      kind: 'console-log',
      scope: 'client',
      message: args.join(' '),
      start: performance.now(),
    });
    log(...args);
  };
  
  console.warn = (...args) => {
    sendToServerWindow({
      kind: 'console-warn',
      scope: 'client',
      message: args.join(' '),
      start: performance.now(),
    });
    warn(...args);
  };

  console.error = (...args) => {
    sendToServerWindow({
      kind: 'console-error',
      scope: 'client',
      message: args.join(' '),
      start: performance.now(),
    });
    error(...args);
  };

  console.debug = (...args) => {
    sendToServerWindow({
      kind: 'console-debug',
      scope: 'client',
      message: args.join(' '),
      start: performance.now(),
    });
    debug(...args);
  };

  window.addEventListener('error', (ev) => {
    sendToServerWindow({
      kind: 'error',
      scope: 'client',
      message: ev.message,
      start: performance.now(),
    });
  });

  document.addEventListener('qsymbol', (ev) => {
    const symbolName = ev.detail.name;
    sendToServerWindow({
      kind: 'symbol',
      scope: 'client',
      message: symbolName,
      start: ev.timeStamp,
    });
  });
  })();`;

  return `<script>${s}</script>${html || ''}`;
};
