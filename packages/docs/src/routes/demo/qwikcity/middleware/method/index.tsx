import { type RequestHandler } from '@qwikdev/city';

export const onRequest: RequestHandler = async ({ method, json }) => {
  json(200, { method });
};
