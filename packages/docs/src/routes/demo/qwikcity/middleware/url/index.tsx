import { type RequestHandler } from '@qwikdev/city';

export const onGet: RequestHandler = async ({ url, json }) => {
  json(200, { url: url.toString() });
};
