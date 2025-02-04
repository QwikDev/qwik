import { type RequestHandler } from '@qwik.dev/router';

export const onGet: RequestHandler = async ({ json }) => {
  json(200, { hello: 'world' });
};
