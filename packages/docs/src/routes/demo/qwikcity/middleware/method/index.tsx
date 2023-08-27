import { type RequestHandler } from '@builder.io/qwik-city';

export const onRequest: RequestHandler = async ({ method, json }) => {
  json(200, { method });
};
