import { type RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = async ({ json, request }) => {
  const obj: Record<string, string> = {};
  request.headers.forEach((v, k) => (obj[k] = v));
  json(200, { headers: obj });
};
