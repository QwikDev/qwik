/**
 * Simple proxy, proxies requests for /repl/* to the main thread
 *
 * - /repl/client/[id]/* => client-side only requests
 * - /repl/ssr/[id]/* => ssr scripts
 * - /repl/* => proxy to / with COEP headers
 *
 * This allows the REPL to load scripts from the same origin, which is required when using `COEP:
 * require-corp`, and it also allows us to still use vite for worker bundling.
 */

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
export type StreamStartMessage = {
  type: 'repl-stream-start';
  requestId: number;
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
  };
};
export type StreamChunkMessage = {
  type: 'repl-stream-chunk';
  requestId: number;
  body: string;
};
export type StreamEndMessage = {
  type: 'repl-stream-end';
  requestId: number;
};

type ReplMessage = ResponseMessage | StreamStartMessage | StreamChunkMessage | StreamEndMessage;

const pendingRequests = new Map<
  number,
  {
    resolve: (r: Response) => void;
    timeoutId: any;
    controller?: ReadableStreamDefaultController<Uint8Array>;
    encoder?: TextEncoder;
  }
>();

let nextId = 1;

/** Intercept requests for `/repl/[id]/*` and request them over the broadcast channel */
(self as any as ServiceWorkerGlobalScope).addEventListener('fetch', (ev: FetchEvent) => {
  // Only GET requests
  if (ev.request.method === 'GET') {
    const reqUrl = new URL(ev.request.url);
    const origin = self.location.origin;
    if (reqUrl.origin === origin) {
      const pathname = reqUrl.pathname;
      const match = pathname.match(/^\/repl\/(client|ssr)\/([a-z0-9]+)\//);
      // Only paths that look like a REPL id
      if (match) {
        const replId = match[2];
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
              url: pathname + reqUrl.search,
              // useful later when adding Qwik Router support
              // method: ev.request.method,
              // headers: Object.fromEntries(ev.request.headers.entries()),
            });
          })
        );
        return;
      } else {
        // Proxy other requests to / and return COEP headers
        const url = pathname.replace(/^\/repl\//, '/') + reqUrl.search;
        const req = new Request(url, {
          method: ev.request.method,
          headers: ev.request.headers,
          redirect: 'manual',
        });
        ev.respondWith(
          fetch(req).then((res) => {
            // Create a new response so we can modify headers
            const newHeaders = new Headers(res.headers);
            newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
            newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
            return new Response(res.body, {
              status: res.status,
              statusText: res.statusText,
              headers: newHeaders,
            });
          })
        );
        return;
      }
    }
  }

  // Fallback to network
  ev.respondWith(fetch(ev.request));
});

/** Receive responses for the REPL requests */
channel.onmessage = (ev: MessageEvent<ReplMessage>) => {
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
  } else if (msg.type === 'repl-stream-start') {
    const pending = pendingRequests.get(msg.requestId);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pending.encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          pending.controller = controller;
        },
      });
      pending.resolve(
        new Response(stream, {
          status: msg.response.status,
          statusText: msg.response.statusText,
          headers: msg.response.headers,
        })
      );
    }
  } else if (msg.type === 'repl-stream-chunk') {
    const pending = pendingRequests.get(msg.requestId);
    pending?.controller?.enqueue(pending.encoder!.encode(msg.body));
  } else if (msg.type === 'repl-stream-end') {
    const pending = pendingRequests.get(msg.requestId);
    if (pending) {
      pending.controller?.close();
      pendingRequests.delete(msg.requestId);
    }
  }
};

self.addEventListener('install', (ev) => {
  (self as any as ServiceWorkerGlobalScope).skipWaiting();
});

self.addEventListener('activate', (ev) => {
  (self as any as ServiceWorkerGlobalScope).clients.claim();
});
