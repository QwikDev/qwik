import { type RequestHandler } from '@qwik.dev/city';

export const onRequest: RequestHandler = async ({ method, json }) => {
  json(200, { method });
};
