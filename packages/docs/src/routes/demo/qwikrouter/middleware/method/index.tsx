import { type RequestHandler } from '@qwik.dev/router';

export const onRequest: RequestHandler = async ({ method, json }) => {
  json(200, { method });
};
