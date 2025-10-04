import { type RequestHandler } from '@qwik.dev/router';

export const onGet: RequestHandler = async ({ url, json }) => {
  json(200, { url: url.toString() });
};
