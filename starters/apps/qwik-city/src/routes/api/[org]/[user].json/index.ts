import type { RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = ({ request, params }) => {
  return {
    timestamp: Date.now(),
    method: request.method,
    url: request.url,
    params,
  };
};

export const onPost: RequestHandler = async ({ request, response }) => {
  response.headers.set('Content-Type', 'text/plain');
  return `HTTP Method: ${request.method}`;
};
