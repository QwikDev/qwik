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

const pendingRequests = new Map<number, { resolve: (r: Response) => void; timeoutId: any }>();

let nextId = 1;

/** Intercept requests for `/repl/[id]/*` and request them over the broadcast channel */
(self as any as ServiceWorkerGlobalScope).addEventListener('fetch', (ev: FetchEvent) => {
  // Only GET requests
  if (ev.request.method === 'GET') {
    const reqUrl = new URL(ev.request.url);
    const pathname = reqUrl.pathname;
    const match = pathname.match(/^\/repl\/([a-z0-9]+)(-ssr)?\//);
    // Only paths that look like a REPL id
    if (match) {
      const replId = match[1];
      ev.respondWith(
        new Promise((resolve) => {
          const requestId = nextId++;

          const timeoutId = setTimeout(() => {
            if (pendingRequests.has(requestId)) {
              pendingRequests.delete(requestId);
              resolve(new Response('504 - Request timeout - try reloading', { status: 504 }));
            }
          }, 10000);

          pendingRequests.set(requestId, { resolve, timeoutId });

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
        })
      );
      return;
    }
  }

  // Fallback to network
  ev.respondWith(fetch(ev.request));
});

/** Receive responses for the REPL requests */
channel.onmessage = (ev: MessageEvent<ResponseMessage>) => {
  const msg = ev.data;

  if (msg.type === 'repl-response') {
    const { requestId, response } = msg;

    if (pendingRequests.has(requestId)) {
      const { resolve, timeoutId } = pendingRequests.get(requestId)!;
      pendingRequests.delete(requestId);
      clearTimeout(timeoutId);

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

self.addEventListener('install', (ev) => {
  (self as any as ServiceWorkerGlobalScope).skipWaiting();
});

self.addEventListener('activate', (ev) => {
  (self as any as ServiceWorkerGlobalScope).clients.claim();
});
