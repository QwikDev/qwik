import type { RequestHandler } from '@qwik.dev/city';

export const onGet: RequestHandler = async ({ send, url }) => {
  const response = await fetch(
    new URL('/demo/qwikcity/middleware/json/', url)
  );
  send(response.status, await response.text());
};
