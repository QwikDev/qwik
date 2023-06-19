import { type RequestHandler } from '@builder.io/qwik-city';

export const onGet: RequestHandler = async ({ url, json }) => {
  json(200, { url: url.toString() });
};
