import { type RequestHandler } from '@qwikdev/city';

export const onGet: RequestHandler = async ({ query, json }) => {
  const obj: Record<string, string> = {};
  query.forEach((v, k) => (obj[k] = v));
  json(200, obj);
};
