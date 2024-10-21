import { type RequestHandler } from '@qwik.dev/city';

export const onGet: RequestHandler = async ({ url, json }) => {
  json(200, { url: url.toString() });
};
