import { type RequestHandler } from '@qwikdev/city';

export const onGet: RequestHandler = async ({ json }) => {
  json(200, { hello: 'world' });
};
