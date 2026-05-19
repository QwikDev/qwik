import type { RequestHandler } from '@qwik.dev/router';

export const onGet: RequestHandler = async ({ send, url }) => {
  const response = await fetch(
    new URL('/demo/qwikrouter/middleware/json/', url)
  );
  send(response.status, await response.text());
};
