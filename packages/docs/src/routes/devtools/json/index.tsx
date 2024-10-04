import { devtoolsJsonSRC } from '@qwik.dev/labs';
import type { RequestHandler } from '@qwik.dev/city';

export const onGet: RequestHandler = async ({ send, headers, cacheControl }) => {
  headers.set('Content-Type', 'application/javascript');
  headers.set('Access-Control-Allow-Origin', '*');
  cacheControl('no-cache');
  send(200, devtoolsJsonSRC);
};
