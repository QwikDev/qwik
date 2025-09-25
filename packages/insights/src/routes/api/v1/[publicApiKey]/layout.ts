import type { RequestEvent } from '@qwik.dev/router';

export const onRequest = ({ url, headers }: RequestEvent) => {
  // add CORS headers
  headers.set('Access-Control-Allow-Origin', url.origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
};
