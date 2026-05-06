import { type RequestHandler } from '@qwik.dev/router';

export const onGet: RequestHandler = async ({ headers, json }) => {
  headers.set('X-SRF-TOKEN', Math.random().toString(36).replace('0.', ''));
  const obj: Record<string, string> = {};
  headers.forEach((value, key) => (obj[key] = value));
  json(200, obj);
};
