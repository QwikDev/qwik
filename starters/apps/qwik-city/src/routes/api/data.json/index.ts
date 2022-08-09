import type { RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = ({ request }) => {
  return {
    timestamp: Date.now(),
    method: request.method,
    url: request.url,
  };
};
