/** Simple proxy, proxies requests for /repl/[id]/* to the main thread */

const channel = new BroadcastChannel('qwik-docs-repl');

export type RequestMessage = {
  type: 'repl-request';
  requestId: number;
  replId: string;
  url: string;
};
export type ResponseMessage = {
  type: 'repl-response';
  requestId: number;
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
  } | null;
};

channel.onmessage = (ev: MessageEvent<ResponseMessage>) => {
  const msg = ev.data;

  if (msg.type === 'repl-response') {
    // Handle response from main thread
    const { requestId, response } = msg;
    const pendingRequests = (self as any).pendingRequests;

    if (pendingRequests && pendingRequests.has(requestId)) {
      const resolve = pendingRequests.get(requestId);
      pendingRequests.delete(requestId);

      if (response) {
        const res = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
        resolve(res);
      } else {
        resolve(new Response('404 - Not found', { status: 404 }));
      }
    }
  }
};

let nextId = 1;
(self as any as ServiceWorkerGlobalScope).addEventListener('fetch', (ev: FetchEvent) => {
  const reqUrl = new URL(ev.request.url);
  const pathname = reqUrl.pathname;

  // We get registered for /repl/* paths only, so we don't interfere with the site itself
  const replId = pathname.split('/')[2];

  // However, when opening in a new tab, for some reason we get requests like /favicon.ico

  // pass-through special paths
  if (!replId || replId.startsWith('~') || replId === 'repl-sw.js') {
    return fetch(ev.request);
  }
  // ensure replId, and for now, only allow GET requests
  if (ev.request.method !== 'GET' || !/^[a-z0-9]+$/.test(replId)) {
    ev.respondWith(new Response('400 - Bad Request', { status: 400 }));
    return;
  }
  ev.respondWith(
    new Promise((resolve) => {
      const requestId = nextId++;
      const pendingRequests =
        (self as any).pendingRequests || ((self as any).pendingRequests = new Map());

      pendingRequests.set(requestId, resolve);

      // Send request to main thread
      channel.postMessage({
        type: 'repl-request',
        requestId,
        replId,
        url: pathname,
        // useful later when adding Qwik Router support
        // method: ev.request.method,
        // headers: Object.fromEntries(ev.request.headers.entries()),
      });
      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          resolve(new Response('504 - Request timeout - try reloading', { status: 504 }));
        }
      }, 10000);
    })
  );
});

self.addEventListener('install', (ev) => {
  (self as any as ServiceWorkerGlobalScope).skipWaiting();
});

self.addEventListener('activate', (ev) => {
  (self as any as ServiceWorkerGlobalScope).clients.claim();
});
