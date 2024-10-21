import { type RequestHandler } from '@qwik.dev/city';

export const onGet: RequestHandler = async ({ json }) => {
  json(200, { hello: 'world' });
};
