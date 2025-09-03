import { QWIK_REPL_DEPS_CACHE } from './repl-constants';

let requestWorker: Worker | null = null;

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data;

  if (msg.type === 'init-request-worker') {
    // Initialize the request worker
    requestWorker = new Worker(msg.workerUrl);
    requestWorker.onmessage = handleRequestWorkerMessage;
    requestWorker.postMessage({ type: 'init', clientId: msg.clientId });
  } else if (msg.type === 'update-build') {
    // Forward build updates to request worker
    if (requestWorker) {
      requestWorker.postMessage({
        type: 'update',
        clientId: msg.clientId,
        buildId: msg.buildId,
        html: msg.html,
        clientBundles: msg.clientBundles,
        ssrModules: msg.ssrModules,
      });
    }
  }
};

self.onfetch = (ev: FetchEvent) => {
  const reqUrl = new URL(ev.request.url);
  const pathname = reqUrl.pathname;

  if (
    pathname.includes('/repl/') &&
    !pathname.includes('/~repl-server') &&
    pathname !== '/repl/repl-sw.js'
  ) {
    ev.respondWith(
      new Promise((resolve) => {
        if (!requestWorker) {
          resolve(new Response('500 - Request worker not initialized', { status: 500 }));
          return;
        }

        const requestId = Math.random().toString(36).substring(2);
        const pendingRequests =
          (self as any).pendingRequests || ((self as any).pendingRequests = new Map());

        pendingRequests.set(requestId, resolve);

        // Send request to worker
        requestWorker!.postMessage({
          type: 'request',
          clientId: '',
          requestId,
          request: {
            url: pathname,
            method: ev.request.method,
            headers: Object.fromEntries(ev.request.headers.entries()),
          },
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (pendingRequests.has(requestId)) {
            pendingRequests.delete(requestId);
            resolve(new Response('504 - Request timeout', { status: 504 }));
          }
        }, 10000);
      })
    );
  }
};

const handleRequestWorkerMessage = (ev: MessageEvent) => {
  const msg = ev.data;

  if (msg.type === 'response') {
    const pendingRequests = (self as any).pendingRequests;
    if (pendingRequests && pendingRequests.has(msg.requestId)) {
      const resolve = pendingRequests.get(msg.requestId);
      pendingRequests.delete(msg.requestId);

      if (msg.response) {
        // Create response with proper headers
        const response = new Response(null, {
          status: msg.response.status,
          statusText: msg.response.statusText,
          headers: msg.response.headers,
        });

        // If it's a blob URL, we need to fetch it
        if (msg.response.body && msg.response.body.startsWith('blob:')) {
          // For blob URLs, we need to handle them differently
          // The service worker can't directly serve blob URLs
          // Instead, we'll redirect to the blob URL
          resolve(Response.redirect(msg.response.body, 302));
        } else {
          resolve(response);
        }
      } else {
        resolve(new Response('404 - Not found', { status: 404 }));
      }
    }
  }
};

self.oninstall = (ev) => {
  self.skipWaiting();
  ev.waitUntil(caches.open(QWIK_REPL_DEPS_CACHE));
};

self.onactivate = () => self.clients.claim();

export interface ReplGlobalApi {
  qwikBuild?: typeof import('@builder.io/qwik');
  qwikCore?: typeof import('@builder.io/qwik');
  qwikOptimizer?: typeof import('@builder.io/qwik/optimizer');
  qwikServer?: typeof import('@builder.io/qwik/server');
  prettier?: typeof import('prettier');
  prettierPlugins?: any;
  rollup?: typeof import('rollup');
  Terser?: typeof import('terser');
  rollupCache?: any;
}

export interface QwikWorkerGlobal extends ReplGlobalApi {
  onmessage: (ev: MessageEvent) => void;
  onfetch: (ev: FetchEvent) => void;
  oninstall: (ev: ExtendableEvent) => void;
  onactivate: () => void;
  skipWaiting: () => void;
  clients: {
    claim: () => void;
  };
}

declare const self: QwikWorkerGlobal;
