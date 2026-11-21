import { type RequestHandler } from '@qwik.dev/router';

export const onGet: RequestHandler = async ({ headers, json }) => {
  headers.set('X-SRF-TOKEN', crypto.randomUUID());
  const obj: Record<string, string> = {};
  headers.forEach((value, key) => (obj[key] = value));
  json(200, obj);
};
